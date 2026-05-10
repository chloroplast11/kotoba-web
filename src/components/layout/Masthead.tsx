"use client";
import { usePathname, useRouter } from "next/navigation";

const NAV_ITEMS = [
  { href: "/", label: "ホーム" },
  { href: "/library", label: "単語帳" },
  { href: "/settings", label: "設定" },
];

export default function Masthead() {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <header className="masthead">
      <div className="brand">
        <span className="brand-jp">言葉帖</span>
        <span className="brand-en">word journal</span>
      </div>
      <nav className="nav">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.href}
            className={pathname === item.href ? "active" : ""}
            onClick={() => router.push(item.href)}
          >
            {item.label}
          </button>
        ))}
      </nav>
    </header>
  );
}
