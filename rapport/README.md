# Rapport TechFOREST

Ce dossier contient le rapport de présentation et le guide d'utilisation de l'application TechFOREST, écrit au format [Quarto](https://quarto.org) (`rapport.qmd`).

## Prérequis

- [Quarto CLI](https://quarto.org/docs/get-started/) installé (`quarto --version` pour vérifier).
- Une distribution LaTeX avec le moteur **XeLaTeX** (le document utilise `pdf-engine: xelatex` pour pouvoir appliquer la police Times New Roman). Si aucune distribution LaTeX n'est installée, Quarto peut en installer une minimale via :

  ```sh
  quarto install tinytex
  ```

- La police **Times New Roman** doit être disponible sur le système (installée par défaut avec Microsoft Office/Windows). Si elle est absente, XeLaTeX échouera à la résolution de la police.

## Générer le PDF

Depuis ce dossier (`rapport/`) :

```sh
quarto render rapport.qmd --to pdf
```

Le fichier `rapport.pdf` est généré à côté de `rapport.qmd`.

## Générer une version Word (.docx)

```sh
quarto render rapport.qmd --to docx
```

## Modifier le rapport

Le contenu est entièrement dans `rapport.qmd` (Markdown). La mise en forme (police, taille, interligne, format du numéro de chapitre) est définie dans l'en-tête YAML en haut du fichier. Après toute modification, relancer la commande `quarto render` pour régénérer le PDF.
