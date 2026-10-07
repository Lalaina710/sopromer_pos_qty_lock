# -*- coding: utf-8 -*-
# Copyright 2026 SOPROMER
# License LGPL-3.0 or later (https://www.gnu.org/licenses/lgpl).
{
    'name': 'SOPROMER POS Quantity Lock',
    'version': '18.0.1.0.1',
    'category': 'Point of Sale',
    'summary': 'Block invalid POS quantities (negative, zero, overstock) with manager override',
    'description': """
SOPROMER POS Quantity Lock
==========================

Bloque trois bypass quantite POS au niveau backend (constraint Python) et
frontend (validation ticket avant paiement) :

1. **qty < 0** : touche `-` ou clavier physique injectant une quantite
   negative sur une ligne hors retour.
2. **qty = 0** : ligne fantome silencieuse (apparait dans le ticket mais
   pas dans le total) generee par double-tap Backspace ou bug saisie.
3. **qty > stock disponible** : alerte ou blocage si la quantite saisie
   depasse le stock physique du produit (mode configurable).

Modes (par PdV)
---------------
* **Permissif** : avertissement console uniquement, validation passe.
* **Override manager** (default) : popup PIN manager pour bypasser.
* **Strict** : blocage total, aucun bypass possible.

Exceptions natives
------------------
* Lignes de retour (refunded_orderline_id ou order is refund) : qty
  negative autorisee sans alerte.

Pattern manager PIN
-------------------
Reutilise le mecanisme du module `sopromer_pos_keyboard_lock` :
SelectionPopup managers + NumberPopup PIN + verification Sha1.
    """,
    'author': 'SOPROMER',
    'website': 'https://github.com/Lalaina710/sopromer_pos_qty_lock',
    'license': 'LGPL-3',
    'depends': [
        'point_of_sale',
        'pos_hr',
        'sensible_pos_access_rights_employee',
        'stock',
    ],
    'data': [
        'views/pos_config_views.xml',
    ],
    'assets': {
        'point_of_sale._assets_pos': [
            'sopromer_pos_qty_lock/static/src/js/qty_lock.js',
        ],
    },
    'installable': True,
    'application': False,
    'auto_install': False,
}
