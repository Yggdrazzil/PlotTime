#!/usr/bin/env bash
# bootstrap-claude-skills.sh
# ---------------------------------------------------------------------------
# À lancer UNE fois à la racine d'un repo, puis committer le dossier .claude/.
#
# Objectif : "figer" (vendoriser) les skills dans .claude/skills/ pour qu'ils
# soient disponibles dans les sessions Claude Code cloud SANS dépendance
# réseau au démarrage — les sessions cloud repartent d'un clone frais du repo,
# donc tout ce qui est committé est là, versionné et reproductible.
# ---------------------------------------------------------------------------

set -euo pipefail

echo "==> Création de .claude/skills/"
mkdir -p .claude/skills

# --- Animation / vidéo programmatique : Remotion (skill officiel) ----------
echo "==> Remotion (best practices)"
npx -y skills add remotion-dev/skills --agent claude-code

# --- Garde-fous de comportement : guidelines "Karpathy" (par Forrest Chang) -
echo "==> Karpathy guidelines"
npx -y skills add forrestchang/andrej-karpathy-skills \
  --skill karpathy-guidelines --agent claude-code

# --- Design : Impeccable (build compilé pour Claude Code) ------------------
# Vendorise le skill 'impeccable' + son manifest de hook dans le projet.
echo "==> Impeccable (design)"
npx -y impeccable install --providers=claude --scope=project \
  || npx -y skills add pbakaus/impeccable --agent claude-code

echo
echo "==> Terminé. Vérifie le contenu, puis committe :"
echo "      git add .claude && git commit -m 'Vendor Claude Code skills' && git push"
echo
echo "NB : Superpowers reste plus propre en PLUGIN (il embarque hooks + sous-agents)."
echo "     Garde-le déclaré dans .claude/settings.json plutôt que de le vendoriser :"
echo '       "enabledPlugins": { "superpowers@claude-plugins-official": true }'
