import type { Metadata } from "next";

import { requireCustomer } from "@/auth/guards";
import { ActionForm, SubmitButton } from "@/components/account/action-form";
import { AccountPage } from "@/components/account/account-page";
import { AddressForm } from "@/components/account/forms";
import { Badge } from "@/components/ui/badge";
import { db } from "@/db";
import { listAddresses, MAX_ADDRESSES } from "@/lib/account/addresses";

import { deleteAddressAction, setDefaultAddressAction } from "../actions";

export const metadata: Metadata = {
  title: "Saved addresses",
  robots: { index: false, follow: false },
};

export default function AddressesPage() {
  return (
    <AccountPage
      title="Saved addresses"
      href="/account/addresses"
      intro="Choose one of these at checkout. Your default address is filled in for you."
    >
      <Addresses />
    </AccountPage>
  );
}

async function Addresses() {
  const user = await requireCustomer("/account/addresses");
  const addresses = await listAddresses(db, user.id);
  return (
    <div className="mt-6 flex flex-col gap-6">
      {addresses.length ? (
        <ul className="grid gap-4 md:grid-cols-2">
          {addresses.map((a) => (
            <li key={a.id} className="flex flex-col gap-3 rounded-2xl border p-5">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-semibold">{a.label ?? "Address"}</h2>
                {a.isDefault ? <Badge variant="secondary">Default</Badge> : null}
              </div>
              <address className="text-sm not-italic">
                {a.name}
                <br />
                {a.line1}
                {a.line2 ? (
                  <>
                    <br />
                    {a.line2}
                  </>
                ) : null}
                <br />
                {a.town}
                {a.county ? `, ${a.county}` : ""} {a.postcode}
              </address>
              <div className="flex flex-wrap gap-2">
                {a.isDefault ? null : (
                  <ActionForm
                    action={setDefaultAddressAction}
                    label={`Make ${a.line1} the default`}
                  >
                    <input type="hidden" name="id" value={a.id} />
                    <SubmitButton variant="outline" pendingText="Saving…">
                      Make default<span className="sr-only"> for {a.line1}</span>
                    </SubmitButton>
                  </ActionForm>
                )}
                <ActionForm action={deleteAddressAction} label={`Delete ${a.line1}`}>
                  <input type="hidden" name="id" value={a.id} />
                  <SubmitButton variant="ghost" pendingText="Deleting…">
                    Delete<span className="sr-only"> {a.line1}</span>
                  </SubmitButton>
                </ActionForm>
              </div>
              <details>
                <summary className="cursor-pointer text-sm font-medium text-primary">
                  Edit<span className="sr-only"> {a.line1}</span>
                </summary>
                <div className="mt-4">
                  <AddressForm address={a} submitLabel="Save changes" />
                </div>
              </details>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground">You haven’t saved any addresses yet.</p>
      )}
      {addresses.length < MAX_ADDRESSES ? (
        <section aria-labelledby="add-address" className="rounded-2xl border p-6">
          <h2 id="add-address" className="text-lg font-semibold">
            Add an address
          </h2>
          <div className="mt-4">
            <AddressForm submitLabel="Save address" />
          </div>
        </section>
      ) : null}
    </div>
  );
}
