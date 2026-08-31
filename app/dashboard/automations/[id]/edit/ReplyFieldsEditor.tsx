"use client";

import { useState } from "react";

type ReplyFieldsEditorProps = {
  initialReplies?: string[];
};

export default function ReplyFieldsEditor({
  initialReplies = [],
}: ReplyFieldsEditorProps) {
  const [replies, setReplies] = useState<string[]>(
    initialReplies.length > 0 ? [...initialReplies] : [""]
  );

  const updateReply = (index: number, value: string) => {
    setReplies((current) =>
      current.map((reply, replyIndex) =>
        replyIndex === index ? value : reply
      )
    );
  };

  const addReply = () => {
    setReplies((current) => [...current, ""]);
  };

  const removeReply = (index: number) => {
    setReplies((current) => {
      if (current.length === 1) {
        return [""];
      }

      return current.filter(
        (_, replyIndex) => replyIndex !== index
      );
    });
  };

  return (
    <div className="mt-5">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <label className="block text-sm font-medium">
            Public Reply Messages
          </label>

          <p className="mt-1 text-xs text-gray-600">
            Replies are sent in order and automatically rotate back
            to the first reply after the last one.
          </p>
        </div>

        <span
          className="
            shrink-0
            rounded-full
            border
            border-[#ff1744]/20
            bg-[#ff1744]/[0.04]
            px-3
            py-1
            text-[10px]
            font-medium
            text-[#ff6b86]
          "
        >
          Rotate
        </span>
      </div>

      <div className="space-y-3">
        {replies.map((reply, index) => (
          <div
            key={`reply-${index}`}
            className="
              rounded-2xl
              border
              border-white/[0.07]
              bg-[#070707]
              p-4
            "
          >
            <div
              className="
                mb-2
                flex
                items-center
                justify-between
                gap-3
              "
            >
              <label
                htmlFor={`reply-${index}`}
                className="
                  text-xs
                  font-medium
                  text-gray-400
                "
              >
                Reply {index + 1}
              </label>

              {replies.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeReply(index)}
                  className="
                    text-xs
                    text-gray-600
                    transition-colors
                    hover:text-red-400
                  "
                >
                  Remove
                </button>
              )}
            </div>

            <textarea
              id={`reply-${index}`}
              name="reply_texts"
              value={reply}
              onChange={(event) =>
                updateReply(
                  index,
                  event.target.value
                )
              }
              rows={4}
              maxLength={1000}
              placeholder="Thanks for commenting ❤️"
              className="
                w-full
                resize-y
                rounded-xl
                border
                border-white/[0.08]
                bg-[#0b0b0b]
                px-4
                py-3
                text-sm
                leading-6
                text-white
                outline-none
                placeholder:text-gray-700
                focus:border-[#ff1744]/40
              "
            />
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={addReply}
        className="
          mt-3
          inline-flex
          items-center
          gap-2
          rounded-xl
          border
          border-white/[0.08]
          bg-white/[0.02]
          px-4
          py-2.5
          text-xs
          font-medium
          text-gray-400
          transition-colors
          hover:border-[#ff1744]/20
          hover:bg-[#ff1744]/[0.03]
          hover:text-white
        "
      >
        <span className="text-base leading-none">
          +
        </span>

        Add Reply
      </button>

      <p className="mt-3 text-[11px] leading-5 text-gray-700">
        Example: Comment 1 → Reply 1, Comment 2 → Reply 2,
        Comment 3 → Reply 3, then back to Reply 1.
      </p>
    </div>
  );
}