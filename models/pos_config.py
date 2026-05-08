# -*- coding: utf-8 -*-
# Copyright 2026 SOPROMER
# License LGPL-3.0 or later (https://www.gnu.org/licenses/lgpl).
from odoo import api, fields, models


class PosConfig(models.Model):
    _inherit = 'pos.config'

    sopromer_qty_lock_mode = fields.Selection(
        selection=[
            ('permissive', 'Permissif (warn uniquement)'),
            ('manager_override', 'Override manager (PIN)'),
            ('strict', 'Strict (blocage total)'),
        ],
        string='Mode controle qty POS',
        default='manager_override',
        help=(
            "Mode de blocage des quantites invalides (negatives, zero, "
            "superieures au stock disponible) lors de la validation du "
            "ticket. Permissif = warn console, Override = PIN manager, "
            "Strict = aucun bypass possible."
        ),
    )

    sopromer_qty_lock_check_stock = fields.Boolean(
        string='Verifier stock disponible',
        default=True,
        help=(
            "Bloque ou avertit (selon le mode) si une quantite saisie "
            "est superieure au stock disponible du produit."
        ),
    )

    @api.model
    def _load_pos_data_fields(self, config_id):
        fields_list = super()._load_pos_data_fields(config_id)
        # Convention Odoo 18: [] = tous les fields. Si super retourne [],
        # ne pas restreindre — les fields custom sont inclus naturellement.
        if not fields_list:
            return []
        return fields_list + [
            'sopromer_qty_lock_mode',
            'sopromer_qty_lock_check_stock',
        ]
