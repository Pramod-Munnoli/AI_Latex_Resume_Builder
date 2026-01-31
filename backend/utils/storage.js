const { createClient } = require('@supabase/supabase-js');
const fs = require('fs').promises;
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('CRITICAL: Supabase credentials (URL or Service Role Key) missing!');
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false
    },
    global: {
        headers: { 'x-my-custom-header': 'resume-builder-backend' }
    }
});

/**
 * Uploads a file to Supabase Storage in a user-associated folder
 * @param {string} localFilePath - Path to the local file
 * @param {string} userId - ID of the user (used for folder naming)
 * @param {string} bucketName - Name of the bucket (default: 'resumes')
 * @param {string} fileName - Optional specific filename (default: 'resume.pdf')
 * @returns {Promise<string>} - The public URL of the uploaded file
 */
async function uploadToStorage(localFilePath, userId, bucketName = 'resumes', fileName = 'resume.pdf') {
    const MAX_RETRIES = 3;
    let lastError;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            const fileBuffer = await fs.readFile(localFilePath);

            // Sanitize filename: remove special characters, keep extension .pdf
            let sanitizedName = fileName.replace(/[^a-z0-9]/gi, '_').toLowerCase();
            if (!sanitizedName.endsWith('.pdf')) sanitizedName += '.pdf';

            // Final location: users/{userId}/{sanitizedName}
            const storagePath = `users/${userId}/${sanitizedName}`;

            // Upload file to Supabase Storage
            console.log(`[Attempt ${attempt}/${MAX_RETRIES}] Uploading to Supabase: ${bucketName}/${storagePath} (size: ${fileBuffer.length} bytes)`);

            const { data, error } = await supabase.storage
                .from(bucketName)
                .upload(storagePath, fileBuffer, {
                    contentType: 'application/pdf',
                    upsert: true,
                    cacheControl: '3600'
                });

            if (error) {
                console.error(`[Attempt ${attempt}] Supabase upload error detail:`, JSON.stringify(error, null, 2));
                throw error;
            }

            console.log(`[Attempt ${attempt}] Upload successful, generating public URL...`);

            // Get public URL
            const { data: { publicUrl } } = supabase.storage
                .from(bucketName)
                .getPublicUrl(storagePath);

            console.log(`Generated Public URL: ${publicUrl}`);
            return publicUrl;

        } catch (err) {
            console.error(`[Attempt ${attempt}] Storage upload failed:`, err.message);
            lastError = err;

            // Wait before retrying (exponential backoff: 1s, 2s, 4s...)
            if (attempt < MAX_RETRIES) {
                const delay = 1000 * Math.pow(2, attempt - 1);
                console.log(`Waiting ${delay}ms before next attempt...`);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }

    throw new Error(`Failed to upload PDF to storage after ${MAX_RETRIES} attempts: ` + lastError.message);
}

/**
 * Deletes all old resume files for a user from Supabase Storage
 * @param {string} userId - ID of the user
 * @param {string} bucketName - Name of the bucket (default: 'resumes')
 */
async function deleteOldResumes(userId, bucketName = 'resumes') {
    try {
        const folder = `users/${userId}/`;

        // List all files in the user's folder
        const { data: files, error: listError } = await supabase.storage
            .from(bucketName)
            .list(`users/${userId}`, { limit: 100 });

        if (listError) {
            console.error('Failed to list old resumes for deletion:', listError);
            return;
        }

        if (!files || files.length === 0) return;

        // Filter only PDF files to be safe
        const filesToDelete = files
            .filter(f => f.name.toLowerCase().endsWith('.pdf'))
            .map(f => `${folder}${f.name}`);

        if (filesToDelete.length > 0) {
            console.log(`Cleaning up ${filesToDelete.length} old resumes for user ${userId}...`);
            const { error: deleteError } = await supabase.storage
                .from(bucketName)
                .remove(filesToDelete);

            if (deleteError) {
                console.error('Failed to delete old resumes:', deleteError);
            } else {
                console.log('Cleanup successful.');
            }
        }
    } catch (err) {
        console.error('Error in deleteOldResumes:', err.message);
        // We don't throw here because cleanup failure shouldn't stop the main flow
    }
}

module.exports = { uploadToStorage, deleteOldResumes };

