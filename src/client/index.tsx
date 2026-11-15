import { createRoot } from "react-dom/client";
import { usePartySocket } from "partysocket/react";
import React, { useLayoutEffect, useRef, useState, useEffect } from "react";
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

function Layout({
	children,
	room,
}: {
	children: React.ReactNode;
	room?: string;
}) {
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
						<b>{room ?? "Chat"}</b>
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
	const [slowModeUntil, setSlowModeUntil] = useState<number | null>(null);
	const [slowModeSecsLeft, setSlowModeSecsLeft] = useState(0);

	// Countdown ticker for slow mode
	useEffect(() => {
		if (!slowModeUntil) return;
		const tick = () => {
			const remaining = Math.ceil((slowModeUntil - Date.now()) / 1000);
			if (remaining <= 0) {
				setSlowModeUntil(null);
				setSlowModeSecsLeft(0);
			} else {
				setSlowModeSecsLeft(remaining);
			}
		};
		tick();
		const id = setInterval(tick, 1000);
		return () => clearInterval(id);
	}, [slowModeUntil]);

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
			if (message.type === "slow_mode") {
				setSlowModeUntil(Date.now() + message.retryAfterMs);
			} else if (message.type === "system") {
				setMessages((msgs) => [
					...msgs,
					{ id: nanoid(8), content: message.content, user: "system", role: "assistant" },
				]);
			} else if (message.type === "add") {
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
					<div key={message.id} className={`row message ${message.user === "system" ? "system-message" : ""}`}>
						<div className="two columns user">{message.user === "system" ? "" : message.user}</div>
						<div className="ten columns">{message.content}</div>
					</div>
				))}
			</div>
			<form
				className="row"
				onSubmit={(e) => {
					e.preventDefault();
					if (slowModeUntil) return;
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

					socket.send(
						JSON.stringify({
							type: "add",
							...chatMessage,
						} satisfies Message),
					);

					content.value = "";
					content.focus();
				}}
			>
				<input
					type="text"
					name="content"
					className="ten columns my-input-text"
					placeholder={
						slowModeUntil
							? `⏳ Slow mode — wait ${slowModeSecsLeft}s...`
							: `Hello ${username}! Type a message...`
					}
					autoComplete="off"
					autoFocus
					disabled={!!slowModeUntil}
				/>
				<button
					type="submit"
					className="send-message two columns"
					disabled={!!slowModeUntil}
				>
					{slowModeUntil ? `${slowModeSecsLeft}s` : "Send"}
				</button>
			</form>
		</div>
	);
}

function RoomLayout() {
	const { room } = useParams();
	const upperRoom = room?.toUpperCase();

	// Normalise room name to uppercase — /london and /LONDON are the same room
	if (room !== upperRoom) {
		return <Navigate to={`/${upperRoom}`} replace />;
	}

	return (
		<Layout room={upperRoom}>
			<App />
		</Layout>
	);
}

// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
createRoot(document.getElementById("root")!).render(
	<BrowserRouter>
		<Routes>
			<Route path="/" element={<Navigate to={`/CHAT`} />} />
			<Route path="/:room" element={<RoomLayout />} />
			<Route path="*" element={<Navigate to="/" />} />
		</Routes>
	</BrowserRouter>,
);
