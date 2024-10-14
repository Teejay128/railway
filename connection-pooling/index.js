const { Client, Pool } = require("pg");
const { Registry, Histogram } = require("prom-client");
const express = require("express");

const app = express();
const port = process.env.PORT || 3000;
const register = new Registry();

const normalTimer = new Histogram({
	name: "normal_connection_duration",
	help: "Duration of queries to the database with normal connections in seconds",
	buckets: [
		0.001, 0.002, 0.003, 0.004, 0.005, 0.006, 0.007, 0.008, 0.009, 0.01,
	],
});
const pooledTimer = new Histogram({
	name: "pooled_connection_duration",
	help: "Duration of queries to the database with pooled connections in seconds",
	buckets: [
		0.001, 0.002, 0.003, 0.004, 0.005, 0.006, 0.007, 0.008, 0.009, 0.01,
	],
});

register.registerMetric(normalTimer);
register.registerMetric(pooledTimer);

const dbConfig = {
	user: "postgres",
	host: "localhost",
	database: "postgres",
	password: "Teejay128*",
	port: 5432,
};

// const dbConfig = {
// 	user: "postgres",
// 	host: "postgres.railway.internal",
// 	database: "railway",
// 	password: "CjzyQtMgMVPtWcVyZDIhneIevpcMVdoT",
// 	connectionString:
// 		"postgresql://postgres:CjzyQtMgMVPtWcVyZDIhneIevpcMVdoT@autorack.proxy.rlwy.net:23334/railway",
// 	port: 5432,
// };

const poolConfig = {
	max: 20,
	connectionTimeoutMillis: 5000,
	idleTimeoutMillis: 10000,
	allowExitOnIdle: false,
};

const pool = new Pool({
	...dbConfig,
	...poolConfig,
});

const dbSetup = async () => {
	const client = new Client(dbConfig);
	await client.connect();
	try {
		client.query("DROP TABLE users");
		client.query(`
			CREATE TABLE users (
				name VARCHAR(100) NOT NULL,
				age INTEGER NOT NULL
			)
		`);
		for (let i = 0; i < 100; i++) {
			client.query("INSERT INTO users (name, age) VALUES ($1, $2)", [
				`person${i}`,
				i,
			]);
		}
		const userCount = await client.query("SELECT * FROM users");
		return userCount.rowCount;
	} catch (err) {
		console.log(err);
	}
};

const normConnection = async () => {
	const client = new Client(dbConfig);
	await client.connect();
	try {
		const end = normalTimer.startTimer();
		// Experiment with different queries
		await client.query("SELECT * FROM users");
		end();

		return normalTimer.hashMap[""].sum;
	} catch (err) {
		console.error(err);
	} finally {
		await client.end();
	}
};

const poolConnection = async () => {
	const client = await pool.connect();
	try {
		const end = pooledTimer.startTimer();
		// Experiment with different queries
		await client.query("SELECT * FROM users");
		end();
		return pooledTimer.hashMap[""].sum;
	} catch (err) {
		console.error(err);
	} finally {
		await client.release();
	}
};

app.get("/norm", async (req, res) => {
	for (let i = 0; i < 100; i++) {
		normConnection();
	}

	res.send("Made a 100 database requests with normal connection");
});

app.get("/pool", async (req, res) => {
	for (let i = 0; i < 100; i++) {
		poolConnection();
	}

	res.send("Made a 100 database requests with pooled connection");
});

app.get("/metrics", async (req, res) => {
	const metrics = await register.metrics();
	res.send(metrics);
});

app.listen(port, async () => {
	console.log(await dbSetup()); // Run once at the start of the application
	console.log("Server running on port: ", port);
});
