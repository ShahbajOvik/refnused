import QRCode from "qrcode";

import { StartTotpSetupButton, TotpConfirmForm } from "@/app/admin/_components/two-factor-forms";
import { getPendingTotpSecret } from "@/auth/staff-service";
import { totpUri } from "@/auth/totp";
import { siteConfig } from "@refnused/database/config/site";
import { db } from "@refnused/database/db";
import { getFieldCipher } from "@refnused/database/lib/crypto/field-encryption";

/** Authenticator app setup: start button, or QR code + confirm form. */
export async function TotpSetupPanel({
  staffId,
  email,
  callbackUrl,
}: {
  staffId: string;
  email: string;
  callbackUrl?: string;
}) {
  const secret = await getPendingTotpSecret(db, staffId, getFieldCipher());
  if (!secret) return <StartTotpSetupButton />;

  const svg = await QRCode.toString(totpUri(secret, email, siteConfig.name), {
    type: "svg",
    margin: 1,
    errorCorrectionLevel: "M",
  });
  const grouped = secret.match(/.{1,4}/g)?.join(" ") ?? secret;

  return (
    <div className="flex flex-col gap-5">
      <ol className="list-decimal space-y-1 pl-5 text-sm">
        <li>
          Open your authenticator app (for example Google Authenticator, Microsoft Authenticator or
          1Password).
        </li>
        <li>Scan the QR code, or enter the key by hand.</li>
        <li>Enter the 6-digit code the app shows.</li>
      </ol>
      <div
        role="img"
        aria-label="QR code for setting up your authenticator app"
        className="size-48 rounded-lg bg-white p-2 [&_svg]:size-full"
        // Generated locally from our own secret, not user input.
        dangerouslySetInnerHTML={{ __html: svg }}
      />
      <p className="text-sm">
        Can’t scan it? Enter this key:{" "}
        <code className="rounded bg-muted px-2 py-1 font-mono text-sm break-all">{grouped}</code>
      </p>
      <TotpConfirmForm callbackUrl={callbackUrl} />
    </div>
  );
}
