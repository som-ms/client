const dotenv = require("dotenv");
dotenv.config();
module.exports = {
  appInsightKey: process.env.INSTRUMENTATION_KEY,
};
