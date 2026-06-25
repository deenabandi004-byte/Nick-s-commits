import { useState } from "react";
import { getCompanyLogoUrl } from "@/utils/suggestionChips";

const COMPANY_BLUE = "#5B7799";
const COMPANY_BLUE_TINT = "rgba(91,119,153,0.08)";

interface ContactAvatarProps {
  name: string;
  size: number;
}

export const ContactAvatar: React.FC<ContactAvatarProps> = ({ name, size }) => {
  const logo = getCompanyLogoUrl(name);
  const [errored, setErrored] = useState(false);
  const showFallback = !logo || errored;

  if (showFallback) {
    const initials = name
      .replace(/&/g, "and")
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0])
      .join("")
      .toUpperCase();
    return (
      <div
        style={{
          width: size,
          height: size,
          borderRadius: 6,
          background: COMPANY_BLUE_TINT,
          color: COMPANY_BLUE,
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: Math.round(size * 0.42),
          fontWeight: 600,
          fontFamily: "'Inter', system-ui, sans-serif",
          letterSpacing: "-0.02em",
        }}
      >
        {initials || "·"}
      </div>
    );
  }
  return (
    <img
      src={logo}
      alt=""
      onError={() => setErrored(true)}
      style={{
        width: size,
        height: size,
        borderRadius: 6,
        objectFit: "contain",
        flexShrink: 0,
        background: "white",
        border: "1px solid var(--line-2, #F0F0ED)",
      }}
    />
  );
};

export default ContactAvatar;
