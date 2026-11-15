export type ChatMessage = {
	id: string;
	content: string;
	user: string;
	role: "user" | "assistant";
};

export type Message =
	| {
			type: "add";
			id: string;
			content: string;
			user: string;
			role: "user" | "assistant";
	  }
	| {
			type: "update";
			id: string;
			content: string;
			user: string;
			role: "user" | "assistant";
	  }
	| {
			type: "all";
			messages: ChatMessage[];
	  }
	| {
			// Sent privately to a connection that is spamming
			type: "slow_mode";
			retryAfterMs: number; // how long they must wait before sending again
	  }
	| {
			// Broadcast to the room when someone is rate-limited
			type: "system";
			content: string;
	  }
	| {
			// Relayed to other connections to show typing indicator
			type: "typing";
			user: string;
			isTyping: boolean;
	  }
	| {
			// Client → server on connect to register username
			type: "join";
			user: string;
	  }
	| {
			// Server → all clients: current user list for this room
			type: "users";
			users: string[];
	  };
