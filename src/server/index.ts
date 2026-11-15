import {
	type Connection,
	Server,
	type WSMessage,
	routePartykitRequest,
} from "partyserver";

import type { ChatMessage, Message } from "../shared";

export class Chat extends Server<Env> {
	static options = { hibernate: true };

	messages = [] as ChatMessage[];

	// connection ID → username for the user list
	private connectionUsers = new Map<string, string>();

	// Rate limiting: track recent message timestamps per connection
	// If a connection sends more than RATE_LIMIT_MAX messages within RATE_LIMIT_WINDOW_MS,
	// they are put on slow mode for SLOW_MODE_DURATION_MS.
	private connectionMessageTimes = new Map<string, number[]>();
	private static readonly RATE_LIMIT_MAX = 5;           // max messages...
	private static readonly RATE_LIMIT_WINDOW_MS = 10000; // ...within 10 seconds
	private static readonly SLOW_MODE_DURATION_MS = 30000; // 30 second cooldown

	broadcastMessage(message: Message, exclude?: string[]) {
		this.broadcast(JSON.stringify(message), exclude);
	}

	broadcastUsers() {
		const users = [...this.connectionUsers.values()];
		this.broadcastMessage({ type: "users", users });
	}

	onStart() {
		// this is where you can initialize things that need to be done before the server starts
		// for example, load previous messages from a database or a service

		// create the messages table if it doesn't exist
		this.ctx.storage.sql.exec(
			`CREATE TABLE IF NOT EXISTS messages (id TEXT PRIMARY KEY, user TEXT, role TEXT, content TEXT)`,
		);

		// load the messages from the database
		this.messages = this.ctx.storage.sql
			.exec(`SELECT * FROM messages`)
			.toArray() as ChatMessage[];
	}

	onConnect(connection: Connection) {
		connection.send(
			JSON.stringify({
				type: "all",
				messages: this.messages,
			} satisfies Message),
		);
		// Send current user list to the new connection
		const users = [...this.connectionUsers.values()];
		connection.send(JSON.stringify({ type: "users", users } satisfies Message));
	}

	onClose(connection: Connection) {
		this.connectionUsers.delete(connection.id);
		this.connectionMessageTimes.delete(connection.id);
		this.broadcastUsers();
	}

	saveMessage(message: ChatMessage) {
		// check if the message already exists
		const existingMessage = this.messages.find((m) => m.id === message.id);
		if (existingMessage) {
			this.messages = this.messages.map((m) => {
				if (m.id === message.id) {
					return message;
				}
				return m;
			});
		} else {
			this.messages.push(message);
		}

		// Use parameterized queries to prevent SQL injection
		this.ctx.storage.sql.exec(
			`INSERT INTO messages (id, user, role, content) VALUES (?, ?, ?, ?)
			 ON CONFLICT (id) DO UPDATE SET content = ?`,
			message.id,
			message.user,
			message.role,
			message.content,
			message.content,
		);
	}

	onMessage(connection: Connection, message: WSMessage) {
		const now = Date.now();
		const id = connection.id;
		const parsed = JSON.parse(message as string) as Message;

		// Join: register username and broadcast updated user list (not rate-limited)
		if (parsed.type === "join") {
			this.connectionUsers.set(id, parsed.user);
			this.broadcastUsers();
			return;
		}

		// Typing events: relay to others, skip rate limiting and storage
		if (parsed.type === "typing") {
			this.broadcast(message, [id]);
			return;
		}

		// Rate limiting check
		const times = this.connectionMessageTimes.get(id) ?? [];
		const recent = times.filter((t) => now - t < Chat.RATE_LIMIT_WINDOW_MS);
		recent.push(now);
		this.connectionMessageTimes.set(id, recent);

		if (recent.length > Chat.RATE_LIMIT_MAX) {
			connection.send(
				JSON.stringify({
					type: "slow_mode",
					retryAfterMs: Chat.SLOW_MODE_DURATION_MS,
				} satisfies Message),
			);
			// Also let the room know
			const user = (parsed as { user?: string }).user ?? "Someone";
			const secs = Chat.SLOW_MODE_DURATION_MS / 1000;
			this.broadcast(
				JSON.stringify({
					type: "system",
					content: `🐢 ${user} gets ${secs}s on the naughty step, for spamming!`,
				} satisfies Message),
			);
			return; // drop the message — do not broadcast
		}

		// let's broadcast the raw message to everyone else
		this.broadcast(message);

		// let's update our local messages store
		if (parsed.type === "add" || parsed.type === "update") {
			this.saveMessage(parsed);
		}
	}
}

export default {
	async fetch(request, env) {
		return (
			(await routePartykitRequest(request, { ...env })) ||
			env.ASSETS.fetch(request)
		);
	},
} satisfies ExportedHandler<Env>;
