import { CompareTray } from "@/components/shop/compare-tray";

/** Shop pages share the compare tray (and leave room for it at the bottom). */
export default function ShopLayout({ children }: LayoutProps<"/shop">) {
  return (
    <div className="pb-24">
      {children}
      <CompareTray />
    </div>
  );
}
