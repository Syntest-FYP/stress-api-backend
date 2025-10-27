const { parseApiDoc } = require("../services/apiDocParser");
const EndpointService = require("../services/endpointService");
const fs = require("fs");
const path = require("path");
const yaml = require("js-yaml");

/**
 * Parse API doc from file path
 */
exports.parseApiDocFromFile = async (req, res) => {
  try {
    const filePath = path.resolve(process.cwd(), req.query.path);
    if (!filePath || !fs.existsSync(filePath)) {
      return res.status(400).json({ error: "File not found" });
    }
    const endpoints = await parseApiDoc(filePath);

    // Optional attach to suite if provided
    if (req.query.suite_id && req.user?.id) {
      try {
        const collection =
          await EndpointService.createOrUpdateEndpointCollection(
            req.user.id,
            req.query.suite_id,
            endpoints
          );
        return res.json({
          parsed: endpoints.length,
          inserted: collection ? collection.total_endpoints : 0,
          endpoints: collection ? collection.endpoints : [],
          collection_id: collection ? collection._id : null,
        });
      } catch (e) {
        console.error("Import error:", e.message);
      }
    }
    res.json(endpoints);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getUploadedSpec = async (req, res) => {
  try {
    const userId = req.user.id;
    const suiteId = req.query.suite_id;

    if (!userId || !suiteId) {
      return res.status(400).json({ error: "Missing suite_id or user ID" });
    }

    const suiteDir = path.join(process.cwd(), "uploads", userId, suiteId);
    if (!fs.existsSync(suiteDir)) {
      return res
        .status(404)
        .json({ error: "No uploaded spec found for this suite" });
    }

    // Check for supported spec files
    const candidates = ["spec.json", "spec.yaml", "spec.yml"];
    const fileName = candidates.find((name) =>
      fs.existsSync(path.join(suiteDir, name))
    );

    if (!fileName) {
      return res.status(404).json({ error: "Spec file not found in uploads" });
    }

    const filePath = path.join(suiteDir, fileName);
    const fileExt = path.extname(fileName).toLowerCase();

    let spec;
    const fileContent = fs.readFileSync(filePath, "utf8");

    if (fileExt === ".json") {
      spec = JSON.parse(fileContent);
    } else {
      spec = yaml.load(fileContent);
    }

    return res.json(spec);
  } catch (err) {
    console.error("Error fetching uploaded spec:", err.message);
    res
      .status(500)
      .json({ error: "Failed to load spec file", details: err.message });
  }
};

/**
 * Upload and parse spec - stores in uploads/{userId}/{suiteId}/
 */
exports.uploadAndParseSpec = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const userId = req.user.id;
    const suiteId = req.body.suite_id;

    if (!userId || !suiteId) {
      // Clean up uploaded file
      if (fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      return res.status(400).json({
        error: "Missing required parameters: suite_id is required",
      });
    }

    // Create user/suite directory structure
    const userDir = path.join(process.cwd(), "uploads", userId);
    const suiteDir = path.join(userDir, suiteId);

    // Create directories if they don't exist
    if (!fs.existsSync(userDir)) {
      fs.mkdirSync(userDir, { recursive: true });
    }
    if (!fs.existsSync(suiteDir)) {
      fs.mkdirSync(suiteDir, { recursive: true });
    }

    // Determine file extension and create new path
    const fileExt = path.extname(req.file.originalname);
    const newFileName = `spec${fileExt}`;
    const destinationPath = path.join(suiteDir, newFileName);

    // Move file from temp location to structured location
    fs.renameSync(req.file.path, destinationPath);

    console.log(`Spec file stored at: ${destinationPath}`);

    // Parse the specification file
    const endpoints = await parseApiDoc(destinationPath);

    // If suite_id provided, import endpoints to database
    if (suiteId) {
      try {
        const collection =
          await EndpointService.createOrUpdateEndpointCollection(
            userId,
            suiteId,
            endpoints
          );

        return res.json({
          success: true,
          message: "File uploaded and endpoints imported successfully",
          file: {
            originalName: req.file.originalname,
            filename: newFileName,
            path: destinationPath,
            relativePath: `uploads/${userId}/${suiteId}/${newFileName}`,
            size: req.file.size,
          },
          parsed: endpoints.length,
          inserted: collection ? collection.total_endpoints : 0,
          endpoints: collection ? collection.endpoints : [],
          collection_id: collection ? collection._id : null,
        });
      } catch (importErr) {
        console.error("Import error:", importErr.message);
        console.error("Suite ID:", suiteId, "User ID:", userId);

        // If import fails, still return parsed endpoints
        return res.json({
          success: true,
          message:
            "File uploaded and parsed successfully, but import to suite failed",
          file: {
            originalName: req.file.originalname,
            filename: newFileName,
            path: destinationPath,
            relativePath: `uploads/${userId}/${suiteId}/${newFileName}`,
            size: req.file.size,
          },
          parsed: endpoints.length,
          inserted: 0,
          endpoints: endpoints,
          importError: importErr.message,
        });
      }
    }

    // Just return parsed endpoints if somehow suite_id is missing
    res.json({
      success: true,
      message: "File uploaded and parsed successfully",
      file: {
        originalName: req.file.originalname,
        filename: newFileName,
        path: destinationPath,
        relativePath: `uploads/${userId}/${suiteId}/${newFileName}`,
        size: req.file.size,
      },
      parsed: endpoints.length,
      endpoints: endpoints,
    });
  } catch (err) {
    // Clean up uploaded file on error
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    res.status(500).json({ error: err.message });
  }
};
