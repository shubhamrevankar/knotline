/* eslint-disable knotline/no-hardcoded-user-visible-string -- Public navigation copy is an owned English catalog pending locale extraction. */
import {
  ArrowRight,
  Blocks,
  BookOpen,
  Bot,
  Boxes,
  ChevronDown,
  CircleHelp,
  FileText,
  Landmark,
  Menu,
  Network,
  ShieldCheck,
  Sparkles,
  UsersRound,
  Waypoints,
  X
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";

import { KnotlineMark } from "./KnotlineLogo.js";
import "./PublicSiteChrome.css";

const productLinks = [
  {
    to: "/product",
    label: "Platform overview",
    body: "See how the operating system fits together.",
    icon: Sparkles
  },
  {
    to: "/product/workflows",
    label: "Workflows",
    body: "Design and run accountable operations.",
    icon: Waypoints
  },
  {
    to: "/product/agents",
    label: "Agents",
    body: "Govern AI work with explicit authority.",
    icon: Bot
  },
  {
    to: "/product/knowledge",
    label: "Knowledge",
    body: "Keep context sourced and permission-aware.",
    icon: Network
  },
  {
    to: "/product/integrations",
    label: "Integrations",
    body: "Connect the systems your team already uses.",
    icon: Boxes
  }
] as const;

const solutionLinks = [
  {
    to: "/solutions/operations",
    label: "Operations",
    body: "Coordinate consequential recurring work.",
    icon: Blocks
  },
  {
    to: "/solutions/support",
    label: "Customer support",
    body: "Resolve cases with context and ownership.",
    icon: CircleHelp
  },
  {
    to: "/solutions/product",
    label: "Product teams",
    body: "Turn signals into governed delivery.",
    icon: Sparkles
  },
  {
    to: "/solutions/it",
    label: "IT & service delivery",
    body: "Standardize access, incidents, and change.",
    icon: Landmark
  }
] as const;

const resourceLinks = [
  {
    to: "/templates",
    label: "Templates",
    body: "Start from proven operational patterns.",
    icon: FileText
  },
  {
    to: "/docs",
    label: "Documentation",
    body: "Build with product and API guidance.",
    icon: BookOpen
  },
  {
    to: "/help",
    label: "Help center",
    body: "Get task-focused product guidance.",
    icon: CircleHelp
  },
  {
    to: "/security",
    label: "Security",
    body: "Review architecture, controls, and trust.",
    icon: ShieldCheck
  }
] as const;

type MenuName = "product" | "solutions" | "resources";

function DesktopMenu({
  name,
  label,
  active,
  onOpen,
  onClose,
  children
}: {
  readonly name: MenuName;
  readonly label: string;
  readonly active: boolean;
  readonly onOpen: (name: MenuName) => void;
  readonly onClose: () => void;
  readonly children: ReactNode;
}) {
  return (
    <div className="site-menu">
      <button
        aria-expanded={active}
        className={active ? "site-menu__trigger site-menu__trigger--active" : "site-menu__trigger"}
        onClick={() => (active ? onClose() : onOpen(name))}
        type="button"
      >
        {label}
        <ChevronDown aria-hidden="true" />
      </button>
      {active ? <div className="site-menu__panel">{children}</div> : null}
    </div>
  );
}

function MenuLinks({
  links,
  onChoose
}: {
  readonly links: readonly { to: string; label: string; body: string; icon: typeof Sparkles }[];
  readonly onChoose: () => void;
}) {
  return (
    <div className="site-menu__links">
      {links.map(({ to, label, body, icon: Icon }) => (
        <Link key={to} onClick={onChoose} to={to}>
          <span>
            <Icon aria-hidden="true" />
          </span>
          <span>
            <strong>{label}</strong>
            <small>{body}</small>
          </span>
          <ArrowRight aria-hidden="true" />
        </Link>
      ))}
    </div>
  );
}

export function PublicHeader() {
  const location = useLocation();
  const [activeMenu, setActiveMenu] = useState<MenuName>();
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setActiveMenu(undefined);
        setMobileOpen(false);
      }
    };
    globalThis.addEventListener("keydown", close);
    return () => globalThis.removeEventListener("keydown", close);
  }, []);

  const closeMenus = () => setActiveMenu(undefined);
  return (
    <header className="site-header">
      <div className="site-header__inner">
        <Link aria-label="Knotline home" className="site-brand" to="/">
          <KnotlineMark className="site-brand__mark" size={27} />
          <span>Knotline</span>
        </Link>
        <nav aria-label="Primary navigation" className="site-header__desktop-nav">
          <DesktopMenu
            active={activeMenu === "product"}
            label="Product"
            name="product"
            onClose={closeMenus}
            onOpen={setActiveMenu}
          >
            <div className="site-menu__intro">
              <span>
                <Waypoints aria-hidden="true" />
              </span>
              <small>THE KNOTLINE PLATFORM</small>
              <strong>
                People and governed agents, moving work through one accountable system.
              </strong>
              <Link onClick={closeMenus} to="/product">
                Explore the platform <ArrowRight aria-hidden="true" />
              </Link>
            </div>
            <MenuLinks links={productLinks} onChoose={closeMenus} />
          </DesktopMenu>
          <DesktopMenu
            active={activeMenu === "solutions"}
            label="Solutions"
            name="solutions"
            onClose={closeMenus}
            onOpen={setActiveMenu}
          >
            <div className="site-menu__intro">
              <span>
                <UsersRound aria-hidden="true" />
              </span>
              <small>BUILT AROUND REAL WORK</small>
              <strong>Operational patterns for teams where ownership and outcomes matter.</strong>
              <Link onClick={closeMenus} to="/solutions/operations">
                View solutions <ArrowRight aria-hidden="true" />
              </Link>
            </div>
            <MenuLinks links={solutionLinks} onChoose={closeMenus} />
          </DesktopMenu>
          <DesktopMenu
            active={activeMenu === "resources"}
            label="Resources"
            name="resources"
            onClose={closeMenus}
            onOpen={setActiveMenu}
          >
            <div className="site-menu__intro">
              <span>
                <BookOpen aria-hidden="true" />
              </span>
              <small>LEARN AND BUILD</small>
              <strong>
                Practical guidance, reusable patterns, and transparent security detail.
              </strong>
              <Link onClick={closeMenus} to="/docs">
                Read documentation <ArrowRight aria-hidden="true" />
              </Link>
            </div>
            <MenuLinks links={resourceLinks} onChoose={closeMenus} />
          </DesktopMenu>
          <Link
            aria-current={location.pathname === "/pricing" ? "page" : undefined}
            className="site-header__plain-link"
            onClick={() => setActiveMenu(undefined)}
            to="/pricing"
          >
            Pricing
          </Link>
        </nav>
        <div className="site-header__actions">
          <Link className="site-header__signin" to="/auth/sign-in">
            Sign in
          </Link>
          <Link className="site-header__cta" to="/auth/sign-in">
            Start building <ArrowRight aria-hidden="true" />
          </Link>
        </div>
        <button
          aria-controls="public-mobile-navigation"
          aria-expanded={mobileOpen}
          aria-label={mobileOpen ? "Close navigation" : "Open navigation"}
          className="site-header__mobile-button"
          onClick={() => setMobileOpen((current) => !current)}
          type="button"
        >
          {mobileOpen ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
        </button>
      </div>
      {mobileOpen ? (
        <nav
          aria-label="Mobile navigation"
          className="site-mobile-nav"
          id="public-mobile-navigation"
        >
          <details>
            <summary>
              Product <ChevronDown aria-hidden="true" />
            </summary>
            <MenuLinks links={productLinks} onChoose={() => setMobileOpen(false)} />
          </details>
          <details>
            <summary>
              Solutions <ChevronDown aria-hidden="true" />
            </summary>
            <MenuLinks links={solutionLinks} onChoose={() => setMobileOpen(false)} />
          </details>
          <details>
            <summary>
              Resources <ChevronDown aria-hidden="true" />
            </summary>
            <MenuLinks links={resourceLinks} onChoose={() => setMobileOpen(false)} />
          </details>
          <Link onClick={() => setMobileOpen(false)} to="/pricing">
            Pricing
          </Link>
          <div>
            <Link to="/auth/sign-in">Sign in</Link>
            <Link className="site-header__cta" to="/auth/sign-in">
              Start building <ArrowRight aria-hidden="true" />
            </Link>
          </div>
        </nav>
      ) : null}
    </header>
  );
}

export function PublicFooter() {
  return (
    <footer className="site-footer">
      <div className="site-footer__top">
        <div>
          <Link className="site-brand" to="/">
            <KnotlineMark className="site-brand__mark" size={27} />
            <span>Knotline</span>
          </Link>
          <p>Accountable operations for people and governed agents.</p>
        </div>
        <div>
          <strong>Product</strong>
          <Link to="/product/workflows">Workflows</Link>
          <Link to="/product/agents">Agents</Link>
          <Link to="/product/knowledge">Knowledge</Link>
          <Link to="/product/integrations">Integrations</Link>
        </div>
        <div>
          <strong>Resources</strong>
          <Link to="/templates">Templates</Link>
          <Link to="/docs">Documentation</Link>
          <Link to="/help">Help center</Link>
          <Link to="/status">System status</Link>
        </div>
        <div>
          <strong>Company</strong>
          <Link to="/security">Security</Link>
          <Link to="/trust">Trust center</Link>
          <Link to="/contact">Contact</Link>
          <Link to="/pricing">Pricing</Link>
        </div>
      </div>
      <div className="site-footer__bottom">
        <span>© 2026 Knotline</span>
        <nav aria-label="Legal">
          <Link to="/legal/privacy">Privacy</Link>
          <Link to="/legal/terms">Terms</Link>
          <Link to="/accessibility">Accessibility</Link>
        </nav>
      </div>
    </footer>
  );
}
