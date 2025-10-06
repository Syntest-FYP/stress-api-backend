const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Ensure uploads directory exists
const uploadsDir = path.join(process.cwd(), 'uploads');
const specsDir = path.join(uploadsDir, 'specs');

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
if (!fs.existsSync(specsDir)) {
  fs.mkdirSync(specsDir, { recursive: true });
}

// Configure multer storage
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const userId = req.user?.id || 'anonymous';
    const userDir = path.join(specsDir, userId.toString());
    
    // Create user-specific directory if it doesn't exist
    if (!fs.existsSync(userDir)) {
      fs.mkdirSync(userDir, { recursive: true });
    }
    
    cb(null, userDir);
  },
  filename: function (req, file, cb) {
    // Generate unique filename with timestamp
    const timestamp = Date.now();
    const originalName = file.originalname;
    const ext = path.extname(originalName);
    const name = path.basename(originalName, ext);
    const uniqueName = `${name}_${timestamp}${ext}`;
    cb(null, uniqueName);
  }
});

// File filter to accept only JSON and YAML files
const fileFilter = (req, file, cb) => {
  const allowedTypes = ['.json', '.yaml', '.yml'];
  const ext = path.extname(file.originalname).toLowerCase();
  
  if (allowedTypes.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error('Only JSON and YAML files are allowed'), false);
  }
};

// Configure multer
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  }
});

module.exports = {
  uploadSpec: upload.single('spec'),
  uploadMultiple: upload.array('specs', 5), // Max 5 files
};


