import { createRoot } from "react-dom/client";
import { usePartySocket } from "partysocket/react";
import React, { useLayoutEffect, useRef, useState } from "react";
import {
	BrowserRouter,
	Routes,
	Route,
	Navigate,
	useParams,
} from "react-router";
import { nanoid } from "nanoid";

import { type ChatMessage, type Message } from "../shared";

type Theme = "light" | "dark";

function getStoredTheme(): Theme {
	const stored = localStorage.getItem("theme");
	return stored === "dark" ? "dark" : "light";
}

function ThemeSelector({
	theme,
	onChange,
}: {
	theme: Theme;
	onChange: (theme: Theme) => void;
}) {
	return (
		<label className="theme-selector">
			<span className="theme-selector-label">Theme</span>
			<select
				value={theme}
				onChange={(e) => onChange(e.target.value as Theme)}
				aria-label="Color theme"
			>
				<option value="light">Light ☀️</option>
				<option value="dark">Dark 🌙</option>
			</select>
		</label>
	);
}

function Layout({ children }: { children: React.ReactNode }) {
	const [theme, setTheme] = useState<Theme>(getStoredTheme);

	useLayoutEffect(() => {
		document.documentElement.setAttribute("data-theme", theme);
		localStorage.setItem("theme", theme);
	}, [theme]);

	return (
		<div className="page container">
			<div className="row page-row">
				<aside className="one-third column sidebar">
					<h4>
						<b>HPANWO</b>
					</h4>
					<ThemeSelector theme={theme} onChange={setTheme} />
				</aside>
				<main className="two-thirds column main">{children}</main>
			</div>
		</div>
	);
}

function App() {
	const [username, setUsername] = useState<string | null>(null);
	const { room } = useParams();

	if (!username) {
		return (
			<div className="chat container">
				<form
					className="row username-form"
					onSubmit={(e) => {
						e.preventDefault();
						const input = e.currentTarget.elements.namedItem(
							"username",
						) as HTMLInputElement;
						const value = input.value.trim();
						if (value) {
							setUsername(value);
						}
					}}
				>
					<h4 className="twelve columns">Join the chat</h4>
					<input
						type="text"
						name="username"
						className="ten columns my-input-text"
						placeholder="Enter your name..."
						autoComplete="off"
						autoFocus
						maxLength={32}
					/>
					<button type="submit" className="two columns send-message">
						Join
					</button>
				</form>
			</div>
		);
	}

	return <Chat room={room} username={username} />;
}

function Chat({
	room,
	username,
}: {
	room: string | undefined;
	username: string;
}) {
	const [messages, setMessages] = useState<ChatMessage[]>([]);
	const messagesRef = useRef<HTMLDivElement>(null);
	const prevMessageCountRef = useRef(0);

	useLayoutEffect(() => {
		const el = messagesRef.current;
		if (!el) return;

		const nearBottom =
			el.scrollHeight - el.scrollTop - el.clientHeight < 150;
		const initialLoad =
			prevMessageCountRef.current === 0 && messages.length > 0;

		if (nearBottom || initialLoad) {
			el.scrollTop = el.scrollHeight;
		}

		prevMessageCountRef.current = messages.length;
	}, [messages]);

	const socket = usePartySocket({
		party: "chat",
		room,
		onMessage: (evt) => {
			const message = JSON.parse(evt.data as string) as Message;
			if (message.type === "add") {
				const foundIndex = messages.findIndex((m) => m.id === message.id);
				if (foundIndex === -1) {
					// probably someone else who added a message
					setMessages((messages) => [
						...messages,
						{
							id: message.id,
							content: message.content,
							user: message.user,
							role: message.role,
						},
					]);
				} else {
					// this usually means we ourselves added a message
					// and it was broadcasted back
					// so let's replace the message with the new message
					setMessages((messages) => {
						return messages
							.slice(0, foundIndex)
							.concat({
								id: message.id,
								content: message.content,
								user: message.user,
								role: message.role,
							})
							.concat(messages.slice(foundIndex + 1));
					});
				}
			} else if (message.type === "update") {
				setMessages((messages) =>
					messages.map((m) =>
						m.id === message.id
							? {
									id: message.id,
									content: message.content,
									user: message.user,
									role: message.role,
								}
							: m,
					),
				);
			} else {
				setMessages(message.messages);
			}
		},
	});

	return (
		<div className="chat container">
			<div className="messages" ref={messagesRef}>
				{messages.map((message) => (
					<div key={message.id} className="row message">
						<div className="two columns user">{message.user}</div>
						<div className="ten columns">{message.content}</div>
					</div>
				))}
			</div>
			<form
				className="row"
				onSubmit={(e) => {
					e.preventDefault();
					const content = e.currentTarget.elements.namedItem(
						"content",
					) as HTMLInputElement;
					const chatMessage: ChatMessage = {
						id: nanoid(8),
						content: content.value,
						user: username,
						role: "user",
					};
					setMessages((messages) => [...messages, chatMessage]);
					// we could broadcast the message here

					socket.send(
						JSON.stringify({
							type: "add",
							...chatMessage,
						} satisfies Message),
					);

					content.value = "";
				}}
			>
				<input
					type="text"
					name="content"
					className="ten columns my-input-text"
					placeholder={`Hello ${username}! Type a message...`}
					autoComplete="off"
				/>
				<button type="submit" className="send-message two columns">
					Send
				</button>
			</form>
		</div>
	);
}

// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
createRoot(document.getElementById("root")!).render(
	<BrowserRouter>
		<Layout>
			<Routes>
				<Route path="/" element={<Navigate to={`/${nanoid()}`} />} />
				<Route path="/:room" element={<App />} />
				<Route path="*" element={<Navigate to="/" />} />
			</Routes>
		</Layout>
	</BrowserRouter>,
);
