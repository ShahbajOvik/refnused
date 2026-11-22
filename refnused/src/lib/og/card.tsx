import { ImageResponse } from "next/og";

import { siteConfig } from "@refnused/database/config/site";
import { OG_IMAGE_SIZE } from "@/lib/metadata";

/*
 * The one Open Graph card layout, drawn by next/og (Satori: inline styles
 * and flexbox only). Each opengraph-image.tsx route fills it in.
 */

const COLOURS = {
  background: "#f7f8fa",
  foreground: "#1a1f26",
  muted: "#5b6472",
  primary: "#0f7a63",
  primarySoft: "#e3f2ee",
  white: "#ffffff",
};

export type OgCardInput = {
  /** Small label above the title, e.g. "Sell your phone". */
  eyebrow: string;
  title: string;
  subtitle?: string;
  /** Highlighted figure, e.g. "Up to £520". */
  highlight?: string;
  /** Short facts shown as pills, e.g. ["Grade A", "12-month warranty"]. */
  pills?: string[];
  /** PNG data URI from loadOgPicture. */
  picture?: string | null;
};

function LogoMark() {
  return (
    <svg width="56" height="56" viewBox="0 0 32 32">
      <rect width="32" height="32" rx="8" fill={COLOURS.primary} />
      <rect
        x="10.5"
        y="6"
        width="11"
        height="20"
        rx="2.5"
        fill="none"
        stroke="#fff"
        strokeWidth="2"
      />
      <path
        d="M13 14.5l2.2 2.2 4-4.2"
        fill="none"
        stroke="#fff"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function ogCard(input: OgCardInput): ImageResponse {
  // Long titles get smaller so title, subtitle and pills always fit under the logo.
  const length = input.title.length + (input.subtitle ? 25 : 0) + (input.picture ? 10 : 0);
  const titleSize = length > 80 ? 48 : length > 55 ? 56 : length > 35 ? 66 : 76;
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        background: COLOURS.background,
        color: COLOURS.foreground,
        padding: 64,
        fontFamily: "sans-serif",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <LogoMark />
          <span style={{ fontSize: 34, fontWeight: 700, letterSpacing: -0.5 }}>
            {siteConfig.name}
          </span>
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            marginTop: "auto",
            paddingTop: 32,
            gap: 18,
          }}
        >
          <span
            style={{
              fontSize: 28,
              fontWeight: 600,
              color: COLOURS.primary,
              textTransform: "uppercase",
              letterSpacing: 2,
            }}
          >
            {input.eyebrow}
          </span>
          <span
            style={{
              fontSize: titleSize,
              fontWeight: 700,
              lineHeight: 1.08,
              letterSpacing: -1.5,
              display: "flex",
            }}
          >
            {input.title}
          </span>
          {input.subtitle ? (
            <span style={{ fontSize: 28, color: COLOURS.muted, lineHeight: 1.3 }}>
              {input.subtitle}
            </span>
          ) : null}
          {input.highlight || input.pills?.length ? (
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 14 }}>
              {input.highlight ? (
                <span
                  style={{
                    fontSize: 40,
                    fontWeight: 700,
                    color: COLOURS.white,
                    background: COLOURS.primary,
                    borderRadius: 18,
                    padding: "10px 24px",
                  }}
                >
                  {input.highlight}
                </span>
              ) : null}
              {input.pills?.map((pill) => (
                <span
                  key={pill}
                  style={{
                    fontSize: 26,
                    fontWeight: 600,
                    color: COLOURS.primary,
                    background: COLOURS.primarySoft,
                    borderRadius: 999,
                    padding: "10px 22px",
                  }}
                >
                  {pill}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      </div>
      {input.picture ? (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 400,
            marginLeft: 40,
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- Satori needs <img> */}
          <img
            src={input.picture}
            alt=""
            style={{ maxWidth: 400, maxHeight: 500, objectFit: "contain", borderRadius: 24 }}
          />
        </div>
      ) : null}
    </div>,
    OG_IMAGE_SIZE,
  );
}

/** Box to pass to loadOgPicture for the card's right-hand picture. */
export const OG_PICTURE_BOX = { width: 800, height: 1000 };
