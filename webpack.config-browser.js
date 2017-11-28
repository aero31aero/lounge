"use strict";

const path = require("path");
const config = require("./webpack.config.js");

config.entry = {
	"js/bundle.test.js": `mocha-loader!${path.resolve(__dirname, "test/client/index.js")}`,
};

// Instrumentation for testing with mocha
config.module.rules.push({
	test: /\.js$/,
	include: path.resolve(__dirname, "test/client"),
	use: "mocha-loader",
});

module.exports = config;
