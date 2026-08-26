# Backhaul.
#
# `make ci` is the gate. Everything else is a shortcut into part of it.

SHELL := /bin/bash
.DEFAULT_GOAL := help

BIN := node_modules/.bin

## help: list targets
help:
	@grep -E '^## ' $(MAKEFILE_LIST) | sed 's/## /  /'

## setup: install everything
setup:
	pnpm install

## test: run the domain tests
test:
	pnpm test

## typecheck: tsc across the workspace
typecheck:
	pnpm typecheck

## lint: eslint across the workspace
lint:
	$(BIN)/eslint .

## boundary: prove the domain purity rule still fires
boundary:
	./scripts/boundary-check.sh

## doc-check: the documentation gate
doc-check:
	./scripts/doc-check.sh

## gates: the blocking checks alone
gates: typecheck lint boundary doc-check

## ci: everything
ci: gates test

## adr: new decision record — make adr T="the decision"
adr:
	@test -n "$(T)" || (echo 'usage: make adr T="the decision"'; exit 1)
	@n=$$(printf '%04d' $$(( $$(ls docs/adr/[0-9]*.md 2>/dev/null | wc -l) + 1 ))); \
	slug=$$(echo "$(T)" | tr '[:upper:]' '[:lower:]' | tr -cs 'a-z0-9' '-' | sed 's/-$$//'); \
	f="docs/adr/$$n-$$slug.md"; \
	printf '# ADR-%s — %s\n\n## Status\n\nProposed — %s.\n\n## Context\n\n\n\n## Decision\n\n\n\n## Consequences\n\n\n' \
	  "$$n" "$(T)" "$$(date +%Y-%m-%d)" > "$$f"; \
	echo "$$f"

## journal: new journal entry — make journal T="what happened"
journal:
	@test -n "$(T)" || (echo 'usage: make journal T="what happened"'; exit 1)
	@tmp=$$(mktemp); \
	awk -v date="$$(date +%Y-%m-%d)" -v title="$(T)" '\
	  /^---$$/ && !done && NR > 5 { \
	    print; print ""; \
	    print "## " date " — " title; print ""; \
	    print "**Did.** "; print ""; \
	    print "### What surprised us"; print ""; print ""; \
	    done = 1; next } { print }' docs/JOURNAL.md > "$$tmp"; \
	mv "$$tmp" docs/JOURNAL.md; \
	echo "docs/JOURNAL.md"

## clean: build output, caches, native artefacts
clean:
	rm -rf packages/*/dist packages/*/.turbo apps/*/.turbo .turbo
	find . -name '*.tsbuildinfo' -not -path './node_modules/*' -delete
	@echo "cleaned — node_modules left alone; make setup-clean to drop that too"

## setup-clean: clean plus node_modules
setup-clean: clean
	find . -name node_modules -maxdepth 3 -type d -prune -exec rm -rf {} +

.PHONY: help setup test typecheck lint boundary doc-check gates ci adr journal clean setup-clean
