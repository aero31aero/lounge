"use strict";

const _ = require("lodash");
const Msg = require("../../models/msg");
const User = require("../../models/user");

module.exports = function(irc, network) {
	const client = this;
	const lobby = network.channels[0];

	irc.on("ctcp response", function(data) {
		let chan = network.getChannel(data.nick);

		if (typeof chan === "undefined") {
			chan = lobby;
		}

		const msg = new Msg({
			type: Msg.Type.CTCP,
			time: data.time,
			from: chan.getUser(data.nick),
			ctcpType: data.type,
			ctcpMessage: data.message,
		});
		chan.pushMessage(client, msg);
	});

	// Limit requests to a rate of one per second max
	irc.on("ctcp request", _.throttle((data) => {
		switch (data.type) {
		case "PING": {
			const split = data.message.split(" ");
			if (split.length === 2) {
				irc.ctcpResponse(data.nick, "PING", split[1]);
			}
			break;
		}
		case "SOURCE": {
			const packageJson = require("../../../package.json");
			irc.ctcpResponse(data.nick, "SOURCE", packageJson.repository.url);
			break;
		}
		}

		// Let user know someone is making a CTCP request against their nick
		const msg = new Msg({
			type: Msg.Type.CTCP_REQUEST,
			time: data.time,
			from: new User({nick: data.nick}),
			hostmask: data.ident + "@" + data.hostname,
			ctcpType: data.type,
			ctcpMessage: data.message,
		});
		lobby.pushMessage(client, msg);
	}, 1000, {trailing: false}));
};
