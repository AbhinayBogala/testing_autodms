"use client";

import { useMemo, useState } from "react";

export type FlowButtonAction = "link" | "flow";

export type AutomationFlowButton = {
  id: string;
  label: string;
  action: FlowButtonAction;
  url?: string;
  targetMessageId?: string;
};

export type AutomationFlowMessage = {
  id: string;
  message: string;
  buttons: AutomationFlowButton[];
};

type AutomationFlowEditorProps = {
  initialFlow?: AutomationFlowMessage[];
};

function makeId(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}_${Date.now().toString(36)}`;
}

function normalizeFlow(value: unknown): AutomationFlowMessage[] {
  if (!Array.isArray(value) || value.length === 0) {
    return [{ id: "message_1", message: "", buttons: [] }];
  }

  const messages = value
    .map((raw, messageIndex) => {
      const item = raw as Partial<AutomationFlowMessage> | null;
      const buttons = Array.isArray(item?.buttons)
        ? item.buttons.map((rawButton, buttonIndex) => {
            const button = rawButton as Partial<AutomationFlowButton> | null;
            const action: FlowButtonAction =
              button?.action === "flow" ? "flow" : "link";

            return {
              id: String(
                button?.id ||
                  `button_${messageIndex + 1}_${buttonIndex + 1}`,
              ),
              label: String(button?.label || ""),
              action,
              ...(button?.url
                ? { url: String(button.url) }
                : {}),
              ...(button?.targetMessageId
                ? {
                    targetMessageId: String(
                      button.targetMessageId,
                    ),
                  }
                : {}),
            } satisfies AutomationFlowButton;
          })
        : [];

      return {
        id: String(item?.id || `message_${messageIndex + 1}`),
        message: String(item?.message || ""),
        buttons,
      } satisfies AutomationFlowMessage;
    })
    .filter((message) => Boolean(message.id));

  return messages.length
    ? messages
    : [{ id: "message_1", message: "", buttons: [] }];
}

function getMessageNumber(
  messages: AutomationFlowMessage[],
  messageId?: string,
) {
  const index = messages.findIndex(
    (message) => message.id === messageId,
  );

  return index >= 0 ? index + 1 : null;
}

export default function AutomationFlowEditor({
  initialFlow = [],
}: AutomationFlowEditorProps) {
  const [messages, setMessages] = useState<AutomationFlowMessage[]>(() =>
    normalizeFlow(initialFlow),
  );

  const serializedFlow = useMemo(
    () => JSON.stringify(messages),
    [messages],
  );

  const updateMessage = (
    messageId: string,
    patch: Partial<AutomationFlowMessage>,
  ) => {
    setMessages((current) =>
      current.map((message) =>
        message.id === messageId
          ? { ...message, ...patch }
          : message,
      ),
    );
  };

  const updateButton = (
    messageId: string,
    buttonId: string,
    patch: Partial<AutomationFlowButton>,
  ) => {
    setMessages((current) =>
      current.map((message) =>
        message.id !== messageId
          ? message
          : {
              ...message,
              buttons: message.buttons.map((button) =>
                button.id === buttonId
                  ? { ...button, ...patch }
                  : button,
              ),
            },
      ),
    );
  };

  const addMessage = () => {
    setMessages((current) => {
      const newMessage = {
        id: makeId("message"),
        message: "",
        buttons: [],
      } satisfies AutomationFlowMessage;

      const hasTargetableMessage = current.some(
        (message) => message.id !== newMessage.id,
      );

      const next = [...current, newMessage];

      // If a Flow button was created before its destination message existed,
      // connect it automatically to the newly-added message.
      if (hasTargetableMessage) {
        return next.map((message) => ({
          ...message,
          buttons: message.buttons.map((button) =>
            button.action === "flow" &&
            !next.some((target) => target.id === button.targetMessageId)
              ? { ...button, targetMessageId: newMessage.id }
              : button,
          ),
        }));
      }

      return next;
    });
  };

  const removeMessage = (messageId: string) => {
    if (messages.length <= 1) return;

    setMessages((current) => {
      const next = current.filter(
        (message) => message.id !== messageId,
      );

      return next.map((message) => {
        const fallbackTarget = next.find(
          (target) => target.id !== message.id,
        )?.id;

        return {
          ...message,
          buttons: message.buttons.map((button) =>
            button.action === "flow" &&
            (!button.targetMessageId ||
              button.targetMessageId === messageId ||
              !next.some((target) => target.id === button.targetMessageId))
              ? {
                  ...button,
                  targetMessageId: fallbackTarget,
                }
              : button,
          ),
        };
      });
    });
  };

  const addButton = (messageId: string) => {
    setMessages((current) =>
      current.map((message) =>
        message.id !== messageId
          ? message
          : {
              ...message,
              buttons:
                message.buttons.length >= 13
                  ? message.buttons
                  : [
                      ...message.buttons,
                      {
                        id: makeId("button"),
                        label: "",
                        action: "link" as FlowButtonAction,
                        url: "",
                      },
                    ],
            },
      ),
    );
  };

  const removeButton = (
    messageId: string,
    buttonId: string,
  ) => {
    setMessages((current) =>
      current.map((message) =>
        message.id !== messageId
          ? message
          : {
              ...message,
              buttons: message.buttons.filter(
                (button) => button.id !== buttonId,
              ),
            },
      ),
    );
  };

  const firstLink = messages
    .flatMap((message) => message.buttons)
    .find(
      (button) =>
        button.action === "link" &&
        Boolean(button.url?.trim()),
    );

  return (
    <div className="mt-5 space-y-4">
      <input
        id="dm_flow"
        name="dm_flow"
        type="hidden"
        value={serializedFlow}
        readOnly
      />

      {/* OVERVIEW */}
      <div className="overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0b0b0b]">
        <div className="border-b border-white/[0.06] p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#ff1744]/10 text-lg text-[#ff6b86]">
                ✦
              </div>
              <div>
                <h3 className="text-sm font-semibold text-white">
                  Build your DM journey
                </h3>
                <p className="mt-1 max-w-xl text-xs leading-5 text-gray-500">
                  Write a message, add buttons, then choose what each button does.
                  A button can open your link or continue to another message.
                </p>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <span className="rounded-full border border-white/[0.08] bg-white/[0.02] px-2.5 py-1 text-[10px] font-medium text-white/50">
                {messages.length} message{messages.length === 1 ? "" : "s"}
              </span>
              <span className="rounded-full border border-white/[0.08] bg-white/[0.02] px-2.5 py-1 text-[10px] font-medium text-white/50">
                {messages.reduce(
                  (count, message) => count + message.buttons.length,
                  0,
                )} {messages.reduce(
                  (count, message) => count + message.buttons.length,
                  0,
                ) === 1 ? "button" : "buttons"}
              </span>
            </div>
          </div>
        </div>

        <div className="grid gap-2 p-4 sm:grid-cols-3">
          <div className="rounded-xl bg-white/[0.025] p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-white/35">
              1. Message
            </p>
            <p className="mt-1 text-xs text-white/60">
              What the person receives
            </p>
          </div>
          <div className="rounded-xl bg-white/[0.025] p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-white/35">
              2. Button
            </p>
            <p className="mt-1 text-xs text-white/60">
              What they can choose
            </p>
          </div>
          <div className="rounded-xl bg-white/[0.025] p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-white/35">
              3. Action
            </p>
            <p className="mt-1 text-xs text-white/60">
              Link or continue the flow
            </p>
          </div>
        </div>
      </div>

      {/* FLOW MAP */}
      {messages.length > 1 && (
        <div className="rounded-2xl border border-[#ff1744]/10 bg-[#ff1744]/[0.025] p-4">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#ff6b86]">
                Flow map
              </p>
              <p className="mt-1 text-xs text-white/40">
                See how your messages connect.
              </p>
            </div>
          </div>

          <div className="flex gap-2 overflow-x-auto pb-1">
            {messages.map((message, index) => (
              <div key={message.id} className="flex shrink-0 items-center gap-2">
                <div className="rounded-xl border border-white/[0.08] bg-[#0b0b0b] px-3 py-2">
                  <p className="text-[10px] font-semibold text-white/40">
                    MESSAGE {index + 1}
                  </p>
                  <p className="mt-0.5 max-w-[160px] truncate text-xs text-white/75">
                    {message.message.trim() || "Empty message"}
                  </p>
                </div>
                {index < messages.length - 1 && (
                  <span className="text-white/20">→</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {messages.map((message, messageIndex) => (
        <div
          key={message.id}
          className="overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0b0b0b]"
        >
          {/* MESSAGE HEADER */}
          <div className="flex flex-col gap-3 border-b border-white/[0.06] p-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                  messageIndex === 0
                    ? "bg-[#ff1744] text-white"
                    : "bg-white/[0.08] text-white/70"
                }`}
              >
                {messageIndex + 1}
              </div>
              <div>
                <p className="text-sm font-semibold text-white">
                  {messageIndex === 0 ? "First DM" : `Flow message ${messageIndex + 1}`}
                </p>
                <p className="mt-0.5 text-[11px] text-white/35">
                  {messageIndex === 0
                    ? "Sent when your comment trigger matches."
                    : "Sent after someone chooses a Flow button."}
                </p>
              </div>
            </div>

            {messages.length > 1 && (
              <button
                type="button"
                onClick={() => removeMessage(message.id)}
                className="self-start rounded-lg border border-red-500/15 px-3 py-1.5 text-[11px] font-medium text-red-300/80 transition hover:bg-red-500/10 hover:text-red-300 sm:self-auto"
              >
                Remove message
              </button>
            )}
          </div>

          {/* MESSAGE */}
          <div className="p-5">
            <label className="block text-xs font-medium text-white/60">
              Message
            </label>
            <textarea
              value={message.message}
              onChange={(event) =>
                updateMessage(message.id, {
                  message: event.target.value,
                })
              }
              rows={5}
              maxLength={2000}
              placeholder={
                messageIndex === 0
                  ? "Hey! 👋 Thanks for commenting..."
                  : "Here are the details you asked for..."
              }
              className="mt-2 w-full resize-y rounded-xl border border-white/[0.07] bg-[#050505] px-4 py-3 text-sm leading-6 text-white outline-none placeholder:text-gray-700 focus:border-[#ff1744]"
            />
            <div className="mt-1.5 flex justify-end text-[10px] text-white/25">
              {message.message.length}/2000
            </div>

            {/* BUTTONS */}
            <div className="mt-5 rounded-xl border border-white/[0.06] bg-white/[0.015] p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-medium text-white/80">
                    Buttons
                  </p>
                  <p className="mt-1 text-[11px] text-white/35">
                    Choose what happens when someone taps each button.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => addButton(message.id)}
                  disabled={message.buttons.length >= 13}
                  className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-[#ff1744]/20 bg-[#ff1744]/[0.06] px-3 py-2 text-[11px] font-semibold text-[#ff6b86] transition hover:bg-[#ff1744]/10 disabled:cursor-not-allowed disabled:opacity-30"
                >
                  <span className="text-base leading-none">+</span>
                  Add button
                </button>
              </div>

              {message.buttons.length === 0 && (
                <div className="mt-4 rounded-xl border border-dashed border-white/[0.08] p-5 text-center">
                  <p className="text-xs font-medium text-white/45">
                    No buttons yet
                  </p>
                  <p className="mt-1 text-[11px] text-white/25">
                    Add a button if you want the user to choose an action.
                  </p>
                </div>
              )}

              <div className="mt-4 space-y-3">
                {message.buttons.map((button, buttonIndex) => {
                  const targetNumber = getMessageNumber(
                    messages,
                    button.targetMessageId,
                  );

                  return (
                    <div
                      key={button.id}
                      className="rounded-xl border border-white/[0.07] bg-[#080808] p-4"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-white/[0.06] text-[10px] font-bold text-white/45">
                            {buttonIndex + 1}
                          </span>
                          <span className="text-xs font-semibold text-white/60">
                            Button
                          </span>
                        </div>

                        <button
                          type="button"
                          onClick={() =>
                            removeButton(message.id, button.id)
                          }
                          className="text-[11px] text-white/25 transition hover:text-red-300"
                        >
                          Remove
                        </button>
                      </div>

                      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_220px]">
                        <div>
                          <label className="text-[11px] font-medium text-white/45">
                            Button text
                          </label>
                          <input
                            value={button.label}
                            onChange={(event) =>
                              updateButton(message.id, button.id, {
                                label: event.target.value,
                              })
                            }
                            maxLength={20}
                            placeholder={
                              button.action === "flow"
                                ? "Get Details"
                                : "Register Now"
                            }
                            className="mt-1.5 w-full rounded-xl border border-white/[0.07] bg-[#050505] px-3.5 py-2.5 text-sm text-white outline-none placeholder:text-gray-700 focus:border-[#ff1744]"
                          />
                        </div>

                        <div>
                          <label className="text-[11px] font-medium text-white/45">
                            What should it do?
                          </label>
                          <div className="mt-1.5 grid grid-cols-2 rounded-xl border border-white/[0.07] bg-[#050505] p-1">
                            <button
                              type="button"
                              onClick={() =>
                                updateButton(message.id, button.id, {
                                  action: "link",
                                  targetMessageId: undefined,
                                })
                              }
                              className={`rounded-lg px-2 py-2 text-[11px] font-medium transition ${
                                button.action === "link"
                                  ? "bg-white/[0.09] text-white"
                                  : "text-white/35 hover:text-white/60"
                              }`}
                            >
                              ↗ Main link
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setMessages((current) => {
                                  const existingTarget = current.find(
                                    (target) =>
                                      target.id !== message.id &&
                                      target.id === button.targetMessageId,
                                  )?.id;

                                  if (existingTarget) {
                                    return current.map((item) =>
                                      item.id === message.id
                                        ? {
                                            ...item,
                                            buttons: item.buttons.map((itemButton) =>
                                              itemButton.id === button.id
                                                ? { ...itemButton, action: "flow" as const, targetMessageId: existingTarget }
                                                : itemButton,
                                            ),
                                          }
                                        : item,
                                    );
                                  }

                                  const fallbackTarget = current.find(
                                    (target) => target.id !== message.id,
                                  )?.id;

                                  if (fallbackTarget) {
                                    return current.map((item) =>
                                      item.id === message.id
                                        ? {
                                            ...item,
                                            buttons: item.buttons.map((itemButton) =>
                                              itemButton.id === button.id
                                                ? { ...itemButton, action: "flow" as const, targetMessageId: fallbackTarget }
                                                : itemButton,
                                            ),
                                          }
                                        : item,
                                    );
                                  }

                                  const newMessage: AutomationFlowMessage = {
                                    id: makeId("message"),
                                    message: "",
                                    buttons: [],
                                  };

                                  return [
                                    ...current.map((item) =>
                                      item.id === message.id
                                        ? {
                                            ...item,
                                            buttons: item.buttons.map((itemButton) =>
                                              itemButton.id === button.id
                                                ? { ...itemButton, action: "flow" as const, targetMessageId: newMessage.id }
                                                : itemButton,
                                            ),
                                          }
                                        : item,
                                    ),
                                    newMessage,
                                  ];
                                });
                              }}
                              className={`rounded-lg px-2 py-2 text-[11px] font-medium transition ${
                                button.action === "flow"
                                  ? "bg-[#ff1744]/10 text-[#ff6b86]"
                                  : "text-white/35 hover:text-white/60"
                              }`}
                            >
                              → Flow
                            </button>
                          </div>
                        </div>
                      </div>

                      {button.action === "link" ? (
                        <div className="mt-4">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <label className="text-[11px] font-medium text-white/45">
                              Destination URL
                            </label>
                            {firstLink?.id === button.id && (
                              <span className="rounded-full border border-emerald-500/15 bg-emerald-500/[0.05] px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-emerald-400/80">
                                Follow-up tracking eligible
                              </span>
                            )}
                          </div>
                          <input
                            type="url"
                            value={button.url || ""}
                            onChange={(event) =>
                              updateButton(message.id, button.id, {
                                url: event.target.value,
                              })
                            }
                            placeholder="https://example.com"
                            className="mt-1.5 w-full rounded-xl border border-white/[0.07] bg-[#050505] px-3.5 py-2.5 text-sm text-white outline-none placeholder:text-gray-700 focus:border-[#ff1744]"
                          />
                          <p className="mt-1.5 text-[10px] text-white/25">
                            Opens this URL when the user taps the button.
                          </p>
                        </div>
                      ) : (
                        <div className="mt-4">
                          <div className="flex items-center justify-between gap-2">
                            <label className="text-[11px] font-medium text-white/45">
                              Continue the conversation
                            </label>
                            {targetNumber && (
                              <span className="text-[10px] font-medium text-[#ff6b86]/70">
                                Goes to Message {targetNumber}
                              </span>
                            )}
                          </div>
                          <select
                            value={button.targetMessageId || ""}
                            onChange={(event) =>
                              updateButton(message.id, button.id, {
                                targetMessageId:
                                  event.target.value || undefined,
                              })
                            }
                            className="mt-1.5 w-full rounded-xl border border-white/[0.07] bg-[#050505] px-3.5 py-2.5 text-sm text-white outline-none focus:border-[#ff1744]"
                          >
                            <option value="">
                              Select the next message
                            </option>
                            {messages.map((target, targetIndex) => (
                              <option
                                key={target.id}
                                value={target.id}
                                disabled={target.id === message.id}
                              >
                                Message {targetIndex + 1}
                                {targetIndex === 0 ? " (first DM)" : ""}
                              </option>
                            ))}
                          </select>
                          <p className="mt-1.5 text-[10px] text-white/25">
                            When the user taps this button, DevilX sends the selected message.
                          </p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      ))}

      {/* ADD MESSAGE */}
      <button
        type="button"
        onClick={addMessage}
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-white/[0.12] bg-white/[0.015] px-4 py-3.5 text-sm font-medium text-white/55 transition hover:border-[#ff1744]/30 hover:bg-[#ff1744]/[0.025] hover:text-white"
      >
        <span className="text-lg leading-none">+</span>
        Add another message
      </button>

      {/* TRACKING EXPLANATION */}
      <div className="rounded-2xl border border-amber-500/10 bg-amber-500/[0.025] p-4">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 text-sm text-amber-300/70">ⓘ</span>
          <div>
            <p className="text-xs font-semibold text-amber-200/80">
              Link tracking
            </p>
            <p className="mt-1 text-[11px] leading-5 text-white/35">
              Your current follow-up system tracks the <strong className="font-medium text-white/55">first valid Main Link</strong> in this flow, and only when <strong className="font-medium text-white/55">Follow-up is enabled</strong>. Other Main Links currently open normally but are not used for the follow-up click check. Flow buttons are not link-tracked.
            </p>
          </div>
        </div>
      </div>

      <p className="text-[10px] leading-4 text-gray-600">
        Instagram uses different message formats for URL buttons and Flow choices. DevilX keeps the two actions separate when needed so your links and Flow buttons continue to work correctly.
      </p>
    </div>
  );
}
