const { Readable } = require('stream');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

// Upload a file buffer to Cloudinary (prod) or local disk (dev).
// Returns the public URL of the stored file.
const uploadToStorage = async (buffer, { folder, originalname, host, protocol }) => {
  if (process.env.CLOUDINARY_CLOUD_NAME) {
    const cloudinary = require('../config/cloudinary');
    return new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        { folder: `taskboard/${folder}`, resource_type: 'auto' },
        (err, result) => (err ? reject(err) : resolve(result.secure_url))
      );
      Readable.from(buffer).pipe(stream);
    });
  }

  // Local disk fallback for development
  const ext = path.extname(originalname).toLowerCase();
  const filename = `${uuidv4()}${ext}`;
  const dir = path.join(__dirname, '../../uploads', folder);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  await fs.promises.writeFile(path.join(dir, filename), buffer);
  return `${protocol}://${host}/uploads/${folder}/${filename}`;
};

// Delete a file given its stored URL or local filename.
const deleteFromStorage = (storedUrl, localDir) => {
  if (!storedUrl) return;
  if (storedUrl.startsWith('https://res.cloudinary.com') || storedUrl.startsWith('http://res.cloudinary.com')) {
    const cloudinary = require('../config/cloudinary');
    // Extract resource_type and public_id from Cloudinary URL
    // URL format: .../image|video|raw/upload/v123.../folder/file.ext
    const match = storedUrl.match(/\/([^/]+)\/upload\/(?:v\d+\/)?(.+)$/);
    if (match) {
      const resourceType = match[1];
      let publicId = match[2];
      // Raw files keep their extension in the public_id; images/video do not
      if (resourceType !== 'raw') publicId = publicId.replace(/\.[^.]+$/, '');
      cloudinary.uploader.destroy(publicId, { resource_type: resourceType }).catch(() => {});
    }
    return;
  }
  // Local disk: storedUrl may be a full URL like http://host/uploads/folder/file.ext
  // or a plain filename like abc123.jpg
  if (localDir) {
    const filename = storedUrl.startsWith('http') ? path.basename(storedUrl) : storedUrl;
    const filepath = path.join(localDir, filename);
    fs.unlink(filepath, () => {});
  }
};

module.exports = { uploadToStorage, deleteFromStorage };
