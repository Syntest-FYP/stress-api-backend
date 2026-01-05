module.exports = {
  testEnvironment: "node",
  verbose: true,
  collectCoverage: true,
  coverageDirectory: "coverage",
  coverageReporters: ["html", "text"],
  reporters: [
    "default",
    [
      "jest-html-reporter",
      {
        outputPath: "reports/test-report.html",
        pageTitle: "Backend Test Report",
      },
    ],
  ],
};
