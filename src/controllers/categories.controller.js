
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
    
    // Extract categories from the analysis (default to empty array if no analysis)
    const categories = analysis?.analysis?.insights?.categories || [];
    
    // Always return 200 with categories (empty array if none found)
    // This prevents frontend errors when no schema has been analyzed yet
    return res.status(200).json({
      success: true,
      data: {
        categories: categories,
        total_categories: categories.length,
        suite_id: suiteId,
        analysis_date: analysis?.created_at || null,
        has_analysis: !!analysis
      },
      metadata: {
        suite_id: suiteId,
        categories_available: categories.length,
        message: categories.length === 0 
          ? "No categories found. Please analyze a schema first to generate categories."
          : "Categories retrieved successfully"
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