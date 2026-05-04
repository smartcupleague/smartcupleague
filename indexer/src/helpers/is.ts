import { Event } from "../processor.js";
import { UserMessageSentEvent } from "../types/index.js";

export function isUserMessageSentEvent(
  event: Event
): event is UserMessageSentEvent {
  return event.name === "Gear.UserMessageSent";
}

// A Sails event has no reply details — it is an outbound message, not a reply.
export function isSailsEvent(event: UserMessageSentEvent): boolean {
  return !Boolean(event.args.message.details);
}
