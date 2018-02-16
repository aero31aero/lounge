"use strict";

const path = require("path");
const sqlite3 = require("sqlite3");
const Helper = require("../helper");
const Msg = require("../models/msg");

const currentSchemaVersion = 1;

let schema = [
	// Schema version #1
	"CREATE TABLE IF NOT EXISTS options (name TEXT, value TEXT, CONSTRAINT name_unique UNIQUE (name))",
	"CREATE TABLE IF NOT EXISTS messages (network TEXT, channel TEXT, time INTEGER, type TEXT, msg TEXT)",
	"CREATE INDEX IF NOT EXISTS network_channel ON messages (network, channel)",
	"CREATE INDEX IF NOT EXISTS time ON messages (time)",
];

class MessageStorage {
	constructor() {
		if (Helper.config.message_store !== "sqlite") { // TODO: Store per user
			return;
		}

		const sqlitePath = path.join(Helper.getHomePath(), "messages.db");

		this.database = new sqlite3.cached.Database(sqlitePath);
		this.database.serialize(() => {
			schema.forEach((line) => this.database.run(line));

			this.database.get("SELECT value FROM options WHERE name = 'schema_version'", (err, row) => {
				if (err) {
					return log.error(`Failed to retrieve schema version: ${err}`);
				}

				// New table
				if (row === undefined) {
					return this.database.run("INSERT INTO options (name, value) VALUES ('schema_version', ?)", currentSchemaVersion);
				}

				const storedSchemaVersion = parseInt(row.value, 10);

				if (storedSchemaVersion === currentSchemaVersion) {
					return;
				}

				if (storedSchemaVersion > currentSchemaVersion) {
					return log.error(`sqlite messages schema version is higher than expected (${storedSchemaVersion} > ${currentSchemaVersion}). Is The Lounge out of date?`);
				}

				log.info(`sqlite messages schema version is out of date (${storedSchemaVersion} < ${currentSchemaVersion}). Running migrations if any.`);

				this.database.run("UPDATE options SET value = ? WHERE name = 'schema_version'", currentSchemaVersion);
			});
		});

		schema = null;
	}

	index(network, channel, msg) {
		if (Helper.config.message_store !== "sqlite") {
			return;
		}

		const clonedMsg = Object.keys(msg).reduce((newMsg, prop) => {
			// id is regenerated when messages are retrieved
			// previews are not stored because storage is cleared on lounge restart
			// type and time are stored in a separate column
			if (prop !== "id" && prop !== "previews" && prop !== "type" && prop !== "time") {
				newMsg[prop] = msg[prop];
			}

			return newMsg;
		}, {});

		this.database.serialize(() => this.database.run(
			"INSERT INTO messages(network, channel, time, type, msg) VALUES(?, ?, ?, ?, ?)",
			network, channel.toLowerCase(), msg.time.getTime(), msg.type, JSON.stringify(clonedMsg)
		));
	}

	/**
	 * Load messages for given channel on a given network and resolve a promise with loaded messages.
	 *
	 * @param Network network - Network object where the channel is
	 * @param Chan channel - Channel object for which to load messages for
	 */
	getMessages(network, channel) {
		if (Helper.config.message_store !== "sqlite" || Helper.config.maxHistory < 1) {
			return Promise.resolve([]);
		}

		return new Promise((resolve, reject) => {
			this.database.parallelize(() => this.database.all(
				"SELECT msg, type, time FROM messages WHERE network = ? AND channel = ? ORDER BY time DESC LIMIT ?",
				[network.uuid, channel.name.toLowerCase(), Helper.config.maxHistory],
				(err, rows) => {
					if (err) {
						return reject(err);
					}

					resolve(rows.map((row) => {
						const msg = JSON.parse(row.msg);
						msg.time = row.time;
						msg.type = row.type;

						return new Msg(msg);
					}).reverse());
				}
			));
		});
	}
}

module.exports = MessageStorage;