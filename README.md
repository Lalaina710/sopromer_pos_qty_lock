# SOPROMER - POS Quantity Lock

Module Odoo 18 qui bloque les quantités invalides côté POS (négatives, zéro, supérieures au stock disponible) avec mode configurable et override manager PIN.

## Contexte

Trois bypass possibles côté POS Odoo natif :

1. **qty < 0** : touche `-` (négatif) ou clavier physique injectant qty négative sur ligne hors retour
2. **qty = 0** : ligne fantôme silencieuse (Backspace jusqu'à 0, apparaît dans ticket sans impact total)
3. **qty > stock disponible** : vente accept à la session, stock devient négatif à la clôture (ergonomie médiocre, ticket déjà encaissé)

Ce module ajoute :

- **Constraint Python backend** sur `pos.order.line` : `qty > 0` sauf retour (filet de sécurité même en cas de bypass frontend / API / import)
- **Patch frontend** sur `PaymentScreen.validateOrder` : bloque/avertit avant POST de la commande
- **Stock check optionnel** : bloque/avertit si qty saisie > stock disponible

## Modes configurables (par PdV `pos.config`)

| Mode | Comportement |
|------|--------------|
| `permissive` | Avertissement console seulement, validation passe |
| `manager_override` (default) | Popup PIN manager pour bypasser |
| `strict` | Blocage total, aucun bypass possible |

Cases options :
- `sopromer_qty_lock_check_stock` (default `True`) : active la vérification stock disponible

## Exceptions automatiques

- **Lignes de retour** (`refunded_orderline_id` ou `order.refunded_order_id`) : qty négative autorisée sans alerte
- **Mode `permissive`** : constraint backend n'applique pas le check `qty > 0`
- **Manager validé via PIN** (mode `manager_override`) : laisse passer l'action

## Pattern manager PIN

Réutilise le mécanisme du module `sopromer_pos_keyboard_lock` :
1. `SelectionPopup` liste les managers (employees avec `role = 'manager'`)
2. `NumberPopup` saisie du PIN
3. Vérification SHA1 du PIN contre `_pin` de l'employé
4. Si OK : action validée, notification de succès
5. Si annulé/PIN faux : action annulée, popup d'erreur

## Caractéristiques techniques

- **Version** : 18.0.1.0.0
- **Catégorie** : Point of Sale
- **License** : LGPL-3
- **Dépendances** : `point_of_sale`, `pos_hr`, `sensible_pos_access_rights_employee`, `stock`
- **Modèles** : `pos.config`, `pos.order.line` (via `_inherit`)
- **Frontend** : patch `PaymentScreen.validateOrder` (asset `_assets_pos`)
- **Backend** : `@api.constrains('qty')` + `_load_pos_data_fields` extension

## Configuration

Settings POS > Point de Vente > [config_id] > section "Contrôle quantités SOPROMER" :
- Mode contrôle qty POS (Permissif / Override manager / Strict)
- Vérifier stock disponible (Bool)

## Installation

```bash
cd /opt/odoo18/custom_addons/dev/
git clone https://github.com/Lalaina710/sopromer_pos_qty_lock.git
sudo chown -R odoo:odoo sopromer_pos_qty_lock
docker exec odoo-dev /opt/odoo/odoo-bin -c /etc/odoo/odoo.conf -d "<base>" -i sopromer_pos_qty_lock --stop-after-init --no-http
docker restart odoo-dev
```

## Tests à valider

1. Vente avec qty=0 sur ligne → bloqué (mode strict) / popup PIN (manager_override) / warn (permissive)
2. Vente avec qty=-2 (hors retour) → idem
3. Vente qty=10 sur produit qty_available=3 → bloqué/popup/warn selon mode
4. Refund (ticket de retour) → qty négative passe sans alerte
5. Manager validé via PIN → action passe partout (mode `manager_override`)

## Notes

- Le check stock POS utilise `qty_available` qui est chargé au démarrage de la session POS — si stock baisse pendant session, le check sera optimiste. Mitigation : warn manager si écart énorme (config future).
- Convention v18 `_load_pos_data_fields` : si `super()` retourne `[]` (= tous les fields), on retourne `[]` sans concatenation pour éviter de filtrer accidentellement les fields natifs (`use_pricelist`, etc.).

## License

LGPL-3
