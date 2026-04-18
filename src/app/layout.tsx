import Link from "next/link";
import "./globals.css";

export const metadata = {
  title: "PMSLink VIR Module",
  description: "Operational vessel inspection module with questionnaire execution, findings workflow, import operations, and dashboards.",
};

const navigation = [
  { href: "/", label: "Dashboard" },
  { href: "/inspections", label: "Inspections" },
  { href: "/inspections/new", label: "Create VIR" },
  { href: "/templates", label: "Templates" },
  { href: "/imports", label: "Import Engine" },
  { href: "/PMSLink_VIR_Module_Spec_v1.html", label: "Original Spec" },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="app-shell">
          <header className="topbar">
            <div>
              <div className="eyebrow">QHSE Link / PMSLink</div>
              <h1 className="app-title">VIR Inspection Operations</h1>
              <p className="app-subtitle">
                Live vessel inspection workspace with questionnaire execution, findings, CAR tracking, sign-off, and template import operations.
              </p>
            </div>
            <div className="topbar-status">
              <span className="chip chip-info">Operational MVP</span>
              <span className="chip chip-warning">Spec-Aligned</span>
            </div>
          </header>

          <nav className="sidebar">
            {navigation.map((item) => (
              <Link key={item.href} className="nav-link" href={item.href}>
                {item.label}
              </Link>
            ))}
          </nav>

          <main className="content">{children}</main>
        </div>
      </body>
    </html>
  );
}

