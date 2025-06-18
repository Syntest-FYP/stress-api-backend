const LoadTester = require("../loadTester");

exports.runLoadTest = async (config) => {
  const tester = new LoadTester(config);
  return await tester.runAndReturn();
};
