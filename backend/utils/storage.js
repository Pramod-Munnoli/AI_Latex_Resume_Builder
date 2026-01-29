const { createClient } = require('@supabase/supabase-js');
const fs = require('fs').promises;
const path = require('path');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('CRITICAL: Supabase credentials (URL or Service Role Key) missing!');
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

/**
 * Uploads a file to Supabase Storage in a user-associated folder
 * @param {string} localFilePath - Path to the local file
 * @param {string} userId - ID of the user (used for folder naming)
 * @param {string} bucketName - Name of the bucket (default: 'resumes')
 * @param {string} fileName - Optional specific filename (default: 'resume.pdf')
 * @returns {Promise<string>} - The public URL of the uploaded file
 */
async function uploadToStorage(localFilePath, userId, bucketName = 'resumes', fileName = 'resume.pdf') {
    try {
        const fileBuffer = await fs.readFile(localFilePath);

        // Sanitize filename: remove special characters, keep extension .pdf
        let sanitizedName = fileName.replace(/[^a-z0-9]/gi, '_').toLowerCase();
        if (!sanitizedName.endsWith('.pdf')) sanitizedName += '.pdf';

        // Final location: users/{userId}/{sanitizedName}
        const storagePath = `users/${userId}/${sanitizedName}`;

        // Upload file to Supabase Storage
        console.log(`Uploading to Supabase: ${bucketName}/${storagePath} (size: ${fileBuffer.length} bytes, cacheControl: no-cache)`);
        const { data, error } = await supabase.storage
            .from(bucketName)
            .upload(storagePath, fileBuffer, {
                contentType: 'application/pdf',
                upsert: true,
                cacheControl: 'no-cache, no-store, must-revalidate'
            });

        if (error) {
            console.error('Supabase upload error detail:', JSON.stringify(error, null, 2));
            throw error;
        }

        console.log('Upload successful, generating public URL...');

        // Get public URL
        const { data: { publicUrl } } = supabase.storage
            .from(bucketName)
            .getPublicUrl(storagePath);

        console.log(`Generated Public URL: ${publicUrl}`);
        return publicUrl;
    } catch (err) {
        console.error('Storage upload error:', err);
        throw new Error('Failed to upload PDF to storage: ' + err.message);
    }
}

module.exports = { uploadToStorage };
