const { parseApiDoc } = require('./src/services/apiDocParser');

(async () => {
  try {
    const endpoints = await parseApiDoc('./MyCollection.postman_collection.json');
    console.log(JSON.stringify(endpoints, null, 2));
  } catch (err) {
    console.error('Error parsing API doc:', err.message);
  }
})();