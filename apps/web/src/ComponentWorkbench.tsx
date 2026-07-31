import {
  AlertDialog,
  Badge,
  Breadcrumb,
  Button,
  Card,
  Checkbox,
  Combobox,
  CommandPalette,
  Dialog,
  EmptyState,
  ErrorState,
  FileField,
  Input,
  Link as UiLink,
  Menu,
  Pagination,
  Popover,
  Radio,
  Select,
  Sheet,
  Skeleton,
  Switch,
  Table,
  Tabs,
  Textarea,
  Toast,
  Tooltip
} from "@knotline/ui";
import { useState } from "react";

import { msg } from "./i18n.js";

export function ComponentWorkbench() {
  const [dialog, setDialog] = useState<"alert" | "dialog" | "palette" | "sheet" | null>(null);
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState("preview");
  const [page, setPage] = useState(1);
  const dismiss = () => setDialog(null);

  return (
    <div className="component-workbench">
      <header>
        <Badge tone="accent">{msg("workbench.badge")}</Badge>
        <h1>{msg("workbench.heading")}</h1>
        <p>{msg("workbench.body")}</p>
      </header>

      <section aria-labelledby="workbench-actions">
        <h2 id="workbench-actions">{msg("workbench.actions")}</h2>
        <div className="workbench-row">
          <Button tone="accent">{msg("workbench.button.primary")}</Button>
          <Button tone="danger">{msg("workbench.button.danger")}</Button>
          <UiLink href="#workbench-forms">{msg("workbench.link")}</UiLink>
          <Tooltip content={msg("workbench.tooltip.body")}>
            <Button>{msg("workbench.tooltip.trigger")}</Button>
          </Tooltip>
        </div>
        <div className="workbench-row">
          <Button onClick={() => setDialog("dialog")}>{msg("workbench.dialog.open")}</Button>
          <Button onClick={() => setDialog("alert")}>{msg("workbench.alert.open")}</Button>
          <Button onClick={() => setDialog("sheet")}>{msg("workbench.sheet.open")}</Button>
          <Button onClick={() => setDialog("palette")}>{msg("workbench.palette.open")}</Button>
        </div>
      </section>

      <section aria-labelledby="workbench-forms-heading" id="workbench-forms">
        <h2 id="workbench-forms-heading">{msg("workbench.forms")}</h2>
        <div className="workbench-grid">
          <Input
            label={msg("workbench.input.label")}
            description={msg("workbench.input.description")}
            placeholder={msg("workbench.input.placeholder")}
          />
          <Select label={msg("workbench.select.label")} defaultValue="review">
            <option value="review">{msg("workbench.select.review")}</option>
            <option value="approve">{msg("workbench.select.approve")}</option>
          </Select>
          <Combobox
            label={msg("workbench.combobox.label")}
            options={[msg("workbench.combobox.people"), msg("workbench.combobox.agent")]}
          />
          <Textarea label={msg("workbench.textarea.label")} />
          <FileField label={msg("workbench.file.label")} />
          <Checkbox label={msg("workbench.checkbox.label")} />
          <Radio label={msg("workbench.radio.label")} name="workbench-radio" />
          <Switch label={msg("workbench.switch.label")} />
        </div>
      </section>

      <section aria-labelledby="workbench-navigation">
        <h2 id="workbench-navigation">{msg("workbench.navigation")}</h2>
        <Breadcrumb label={msg("workbench.breadcrumb.label")}>
          <li>{msg("workbench.breadcrumb.home")}</li>
          <li>{msg("workbench.breadcrumb.current")}</li>
        </Breadcrumb>
        <Tabs
          label={msg("workbench.tabs.label")}
          active={tab}
          onChange={setTab}
          tabs={[
            {
              id: "preview",
              label: msg("workbench.tabs.preview"),
              panel: msg("workbench.tabs.previewbody")
            },
            {
              id: "history",
              label: msg("workbench.tabs.history"),
              panel: msg("workbench.tabs.historybody")
            }
          ]}
        />
        <Pagination
          page={page}
          pages={3}
          label={msg("workbench.pagination.label")}
          previousLabel={msg("workbench.pagination.previous")}
          nextLabel={msg("workbench.pagination.next")}
          onChange={setPage}
        />
        <Menu label={msg("workbench.menu.label")}>
          <Button role="menuitem">{msg("workbench.menu.edit")}</Button>
          <Button role="menuitem">{msg("workbench.menu.archive")}</Button>
        </Menu>
      </section>

      <section aria-labelledby="workbench-data">
        <h2 id="workbench-data">{msg("workbench.data")}</h2>
        <Table>
          <thead>
            <tr>
              <th>{msg("workbench.table.workflow")}</th>
              <th>{msg("workbench.table.status")}</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>{msg("workbench.table.sample")}</td>
              <td>
                <Badge tone="success">{msg("workbench.table.active")}</Badge>
              </td>
            </tr>
          </tbody>
        </Table>
        <div className="workbench-grid">
          <Card>
            <h3>{msg("workbench.card.heading")}</h3>
            <p>{msg("workbench.card.body")}</p>
          </Card>
          <Popover>{msg("workbench.popover")}</Popover>
          <Toast>{msg("workbench.toast")}</Toast>
          <Skeleton label={msg("workbench.skeleton")} />
          <EmptyState title={msg("workbench.empty.heading")}>
            <p>{msg("workbench.empty.body")}</p>
          </EmptyState>
          <ErrorState title={msg("workbench.error.heading")}>
            <p>{msg("workbench.error.body")}</p>
          </ErrorState>
        </div>
      </section>

      <Dialog
        open={dialog === "dialog"}
        title={msg("workbench.dialog.heading")}
        onDismiss={dismiss}
      >
        <p>{msg("workbench.dialog.body")}</p>
        <Button onClick={dismiss}>{msg("workbench.close")}</Button>
      </Dialog>
      <AlertDialog
        open={dialog === "alert"}
        title={msg("workbench.alert.heading")}
        onDismiss={dismiss}
      >
        <p>{msg("workbench.alert.body")}</p>
        <Button onClick={dismiss}>{msg("workbench.close")}</Button>
      </AlertDialog>
      <Sheet open={dialog === "sheet"} title={msg("workbench.sheet.heading")} onDismiss={dismiss}>
        <p>{msg("workbench.sheet.body")}</p>
        <Button onClick={dismiss}>{msg("workbench.close")}</Button>
      </Sheet>
      <CommandPalette
        open={dialog === "palette"}
        title={msg("workbench.palette.heading")}
        queryLabel={msg("workbench.palette.query")}
        query={query}
        onQuery={setQuery}
        onDismiss={dismiss}
      >
        <Button>{msg("workbench.palette.result")}</Button>
      </CommandPalette>
    </div>
  );
}
