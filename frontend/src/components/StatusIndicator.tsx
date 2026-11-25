import "./recordList.css";
import { stateNames } from "../tenancy";
import { financeStates } from "../finances";
import { capitalStates } from "../anticreticos";
import { distributionStates } from "../utilities";
import {
  attentionNames,
  communicationNames,
  priorities,
  reportStates,
} from "../reminders";

export type StatusTone = "green" | "red" | "amber" | "blue" | "purple" | "gray";

const icons: Record<StatusTone, string> = {
  green: "✓",
  red: "!",
  amber: "◷",
  blue: "●",
  purple: "⚒",
  gray: "⊘",
};

export function StatusIndicator({
  tone,
  label,
  icon,
  className,
}: {
  tone: StatusTone;
  label: string;
  icon?: string;
  className?: string;
}) {
  return (
    <span
      className={["status-indicator", className].filter(Boolean).join(" ")}
      data-tone={tone}
    >
      <span aria-hidden="true">{icon ?? icons[tone]}</span>
      <span>{label}</span>
    </span>
  );
}

const domains = {
  contract: {
    labels: stateNames,
    tones: {
      draft: "gray",
      active: "blue",
      finished: "green",
      cancelled: "gray",
    },
  },
  reservation: {
    labels: stateNames,
    tones: {
      pending: "amber",
      confirmed: "amber",
      expired: "red",
      converted: "green",
      cancelled: "gray",
    },
  },
  finance: {
    labels: financeStates,
    tones: {
      pending: "amber",
      partial: "amber",
      paid: "green",
      overdue: "red",
      adjusted: "gray",
      voided: "gray",
      registered: "blue",
      received: "green",
      held: "blue",
      partially_applied: "amber",
      partially_refunded: "amber",
      refunded: "green",
    },
  },
  movement: {
    labels: financeStates,
    tones: {
      registered: "green",
      received: "green",
      voided: "gray",
      held: "blue",
      partially_applied: "amber",
      partially_refunded: "amber",
      refunded: "green",
    },
  },
  capital: {
    labels: capitalStates,
    tones: {
      preparation: "blue",
      pending_receipt: "amber",
      partial_receipt: "amber",
      received: "amber",
      partial_return: "amber",
      returned: "green",
      settled_by_agreement: "green",
      overdue: "red",
    },
  },
  distribution: {
    labels: distributionStates,
    tones: {
      draft: "gray",
      calculated: "amber",
      needs_review: "amber",
      confirmed: "green",
      superseded: "gray",
    },
  },
  priority: {
    labels: priorities,
    tones: {
      upcoming: "amber",
      today: "amber",
      overdue: "red",
      date_missing: "amber",
      resolved: "green",
      scheduled: "gray",
    },
  },
  attention: {
    labels: attentionNames,
    tones: {
      pending: "amber",
      reviewed: "blue",
      snoozed: "amber",
      resolved: "green",
      scheduled: "gray",
    },
  },
  communication: {
    labels: communicationNames,
    tones: {
      prepared: "amber",
      opened: "blue",
      manual_sent: "blue",
      not_sent: "gray",
      correct_sent: "blue",
      correct_not_sent: "gray",
    },
  },
  paymentReport: {
    labels: reportStates,
    tones: {
      reported: "blue",
      pending: "amber",
      verified: "green",
      rejected: "gray",
      verification_invalid: "red",
    },
  },
} satisfies Record<
  string,
  { labels: Record<string, string>; tones: Record<string, StatusTone> }
>;

export function RecordStatus({
  domain,
  state,
  label,
}: {
  domain: keyof typeof domains;
  state: string;
  label?: string;
}) {
  const {
    labels,
    tones,
  }: {
    labels: Record<string, string>;
    tones: Record<string, StatusTone>;
  } = domains[domain];
  const icon =
    domain === "attention" && state === "snoozed"
      ? "Ⅱ"
      : domain === "priority" && state === "today"
        ? "◴"
        : domain === "finance" && state === "partial"
          ? "◐"
          : domain === "communication" &&
              ["manual_sent", "correct_sent"].includes(state)
            ? "↗"
            : undefined;
  return (
    <StatusIndicator
      tone={tones[state] ?? "gray"}
      label={label ?? labels[state] ?? state}
      icon={icon}
    />
  );
}
