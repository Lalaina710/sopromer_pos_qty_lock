# -*- coding: utf-8 -*-
# Copyright 2026 SOPROMER
# License LGPL-3.0 or later (https://www.gnu.org/licenses/lgpl).
from odoo import _, api, models
from odoo.exceptions import ValidationError


class PosOrderLine(models.Model):
    _inherit = 'pos.order.line'

    @api.constrains('qty')
    def _check_qty_positive(self):
        """Backend safety net: prevent qty <= 0 hors retour.

        Le frontend (qty_lock.js) intercepte avant validation.
        Cette constraint protege contre les bypass API/import.
        """
        for line in self:
            # Exception 1: ligne de retour (Many2one vers ligne refundee)
            if line.refunded_orderline_id:
                continue
            # Exception 2: order entiere est un retour (refunded_order_id pose
            # par le natif quand on duplique une commande en retour)
            order = line.order_id
            if hasattr(order, 'refunded_order_id') and order.refunded_order_id:
                continue
            # Exception 3: pos.config en mode permissif laisse passer
            session = order.session_id
            if not session or not session.config_id:
                continue
            cfg = session.config_id
            if cfg.sopromer_qty_lock_mode == 'permissive':
                continue

            if line.qty <= 0:
                raise ValidationError(_(
                    "Quantite invalide sur la ligne %(product)s : "
                    "%(qty)s. Les quantites nulles ou negatives ne "
                    "sont pas autorisees (sauf retours).",
                    product=line.product_id.display_name,
                    qty=line.qty,
                ))
