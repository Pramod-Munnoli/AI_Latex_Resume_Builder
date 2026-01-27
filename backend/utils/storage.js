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
 * @returns {Promise<string>} - The public URL of the uploaded file
 */
async function uploadToStorage(localFilePath, userId, bucketName = 'resumes') {
    try {
        const fileBuffer = await fs.readFile(localFilePath);

        // Final location: users/{userId}/resume.pdf
        // This ensures each user has their own unique path and only ONE resume at a time
        const storagePath = `users/${userId}/resume.pdf`;

        // Use service role for admin tasks like listing/creating buckets
        const { data: buckets } = await supabase.storage.listBuckets();
        const bucketExists = buckets?.some(b => b.name === bucketName);

        if (!bucketExists) {
            console.log(`Creating public bucket: ${bucketName}`);
            await supabase.storage.createBucket(bucketName, {
                public: true,
                allowedMimeTypes: ['application/pdf']
            });
        }

        // Explicitly remove the old file first to force a fresh upload/CDN invalidation
        console.log(`Ensuring fresh upload by removing existing file at: ${storagePath}`);
        await supabase.storage.from(bucketName).remove([storagePath]);

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
