
const { getSpecAnalysisBySuite } = require("../models/spec.model");



/**
 * Get categories from analyzed schema
 * GET /api/test-generation/categories/:suiteId
 */
const getCategories = async (req, res) => {
  try {
    const { suiteId } = req.params;
    const userId = req.user._id || req.user.id;

    // Get analyzed schema for this suite
    const analysis = await getSpecAnalysisBySuite(suiteId);
    
    if (!analysis) {
      return res.status(404).json({
        success: false,
        message: "No analyzed schema found for this suite. Please analyze a schema first.",
      });
    }

    // Extract categories from the analysis
    const categories = analysis.analysis?.insights?.categories || [];
    
    if (!categories || categories.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No categories found in the analyzed schema.",
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        categories: categories,
        total_categories: categories.length,
        suite_id: suiteId,
        analysis_date: analysis.created_at
      },
      metadata: {
        suite_id: suiteId,
        categories_available: categories.length
      }
    });
  } catch (error) {
    console.error("[ERROR] getCategories:", error.message);

    return res.status(500).json({
      success: false,
      message: "Failed to get categories",
      error: error.message,
    });
  }
};


module.exports = {
    getCategories,
  };