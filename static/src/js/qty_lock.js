/** @odoo-module **/

/**
 * SOPROMER POS Quantity Lock
 *
 * Patches PaymentScreen.validateOrder to intercept three bypass paths:
 *
 *   1. line.qty < 0 (hors retour)
 *   2. line.qty == 0 (ligne fantome silencieuse)
 *   3. line.qty > product.qty_available (overstock, si check_stock=true)
 *
 * Behavior depends on pos.config.sopromer_qty_lock_mode:
 *   - 'permissive'        → console.warn, validation passe
 *   - 'manager_override'  → SelectionPopup manager + PIN (Sha1)
 *   - 'strict'            → AlertDialog, validation bloquee
 *
 * Manager override pattern reused from sopromer_pos_keyboard_lock.
 */

/* global Sha1 */

import { patch } from "@web/core/utils/patch";
import { useService } from "@web/core/utils/hooks";
import { PaymentScreen } from "@point_of_sale/app/screens/payment_screen/payment_screen";
import { AlertDialog } from "@web/core/confirmation_dialog/confirmation_dialog";
import { SelectionPopup } from "@point_of_sale/app/utils/input_popups/selection_popup";
import { NumberPopup } from "@point_of_sale/app/utils/input_popups/number_popup";
import { makeAwaitable } from "@point_of_sale/app/store/make_awaitable_dialog";
import { _t } from "@web/core/l10n/translation";


patch(PaymentScreen.prototype, {
    setup() {
        super.setup();
        this.notification = useService("notification");
    },

    // -------------------------------------------------------------------------
    // Detection helpers
    // -------------------------------------------------------------------------

    /**
     * Returns lines with qty <= 0 that are NOT refund lines.
     */
    _getInvalidQtyLines(order) {
        return order.lines.filter((line) => {
            const isRefund =
                line.refunded_orderline_id ||
                order.refunded_order_id ||
                (line.refunded_qty && line.refunded_qty > 0);
            return !isRefund && line.qty <= 0;
        });
    },

    /**
     * Returns lines whose qty exceeds the product's available stock.
     * Skips services / consumables (only 'product' type tracked).
     */
    _getOverstockLines(order) {
        return order.lines.filter((line) => {
            const product = line.product_id;
            if (!product) {
                return false;
            }
            // Only stockable products are checked
            const productType = product.type || product.detailed_type;
            if (productType !== "product") {
                return false;
            }
            const available = product.qty_available || 0;
            return line.qty > available;
        });
    },

    _formatLines(lines, withStock = false) {
        return lines
            .map((l) => {
                const name = l.product_id.display_name;
                if (withStock) {
                    const dispo = l.product_id.qty_available || 0;
                    return `${name} (vente=${l.qty}, dispo=${dispo})`;
                }
                return `${name} (qty=${l.qty})`;
            })
            .join(", ");
    },

    // -------------------------------------------------------------------------
    // Manager override (pattern from sopromer_pos_keyboard_lock)
    // -------------------------------------------------------------------------

    _getManagerEmployees() {
        if (this.pos.config.module_pos_hr && this.pos.models["hr.employee"]) {
            return this.pos.models["hr.employee"].getAll().filter((emp) => {
                const role = emp._role || emp.role;
                return role === "manager";
            });
        }
        return [];
    },

    async _askManagerOverride(reason) {
        const managers = this._getManagerEmployees();

        // No pos_hr / no managers → block, no bypass possible
        if (!this.pos.config.module_pos_hr || managers.length === 0) {
            this.notification.add(reason, {
                type: "warning",
                title: _t("Action Blocked"),
            });
            return false;
        }

        // Step 1 — select manager
        const managerList = managers.map((emp) => ({
            id: emp.id,
            item: emp,
            label: emp.name,
            isSelected: false,
        }));

        const selectedManager = await makeAwaitable(this.dialog, SelectionPopup, {
            title: _t("Manager Authorization Required"),
            list: managerList,
        });

        if (!selectedManager) {
            this.notification.add(_t("Action cancelled."), { type: "info" });
            return false;
        }

        // Step 2 — verify PIN if set
        if (selectedManager._pin) {
            const inputPin = await makeAwaitable(this.dialog, NumberPopup, {
                formatDisplayedValue: (x) => x.replace(/./g, "•"),
                title: _t("PIN — %s", selectedManager.name),
            });

            if (!inputPin) {
                this.notification.add(_t("Action cancelled."), { type: "info" });
                return false;
            }

            if (typeof Sha1 === "undefined" || selectedManager._pin !== Sha1.hash(inputPin)) {
                this.notification.add(_t("Wrong PIN"), {
                    type: "danger",
                    title: _t("Access Denied"),
                });
                return false;
            }
        }

        this.notification.add(_t("Authorized by %s", selectedManager.name), {
            type: "success",
        });
        return true;
    },

    // -------------------------------------------------------------------------
    // Core override
    // -------------------------------------------------------------------------

    async validateOrder(isForceValidate) {
        const order = this.currentOrder;
        if (!order) {
            return super.validateOrder(...arguments);
        }
        const cfg = this.pos.config;
        const mode = cfg.sopromer_qty_lock_mode || "manager_override";

        // -------- Check 1: qty <= 0 hors retour --------
        const invalidLines = this._getInvalidQtyLines(order);
        if (invalidLines.length > 0) {
            const desc = this._formatLines(invalidLines);

            if (mode === "strict") {
                this.dialog.add(AlertDialog, {
                    title: _t("Quantites invalides"),
                    body: _t(
                        "Lignes avec qty <= 0 detectees : %s. " +
                            "Corrigez avant validation (mode strict).",
                        desc
                    ),
                });
                return;
            }

            if (mode === "manager_override") {
                const reason = _t(
                    "Quantites nulles/negatives detectees : %s",
                    desc
                );
                const ok = await this._askManagerOverride(reason);
                if (!ok) {
                    return;
                }
            } else {
                // permissive
                console.warn("[sopromer_pos_qty_lock] qty<=0 detected:", desc);
            }
        }

        // -------- Check 2: stock disponible --------
        if (cfg.sopromer_qty_lock_check_stock) {
            const overstock = this._getOverstockLines(order);
            if (overstock.length > 0) {
                const desc = this._formatLines(overstock, true);

                if (mode === "strict") {
                    this.dialog.add(AlertDialog, {
                        title: _t("Stock insuffisant"),
                        body: _t(
                            "Lignes en rupture : %s. Corrigez avant " +
                                "validation (mode strict).",
                            desc
                        ),
                    });
                    return;
                }

                if (mode === "manager_override") {
                    const reason = _t(
                        "Stock insuffisant : %s",
                        desc
                    );
                    const ok = await this._askManagerOverride(reason);
                    if (!ok) {
                        return;
                    }
                } else {
                    // permissive
                    console.warn(
                        "[sopromer_pos_qty_lock] overstock detected:",
                        desc
                    );
                }
            }
        }

        return super.validateOrder(...arguments);
    },
});
