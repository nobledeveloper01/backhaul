# Backhaul.
#
# `make ci` is the gate. Everything else is a shortcut into part of it.

SHELL := /bin/bash
.DEFAULT_GOAL := help

BIN := node_modules/.bin

# The SDK is installed per-user rather than system-wide, so it is not on a
# default PATH. Overridable for CI, where it usually is.
DOTNET ?= $(HOME)/.dotnet/dotnet

## help: list targets
help:
	@grep -E '^## ' $(MAKEFILE_LIST) | sed 's/## /  /'

## setup: install everything
setup:
	pnpm install

## test: run the domain tests
test:
	pnpm test

## typecheck: tsc across the workspace, and the scripts that guard the gates
typecheck:
	pnpm typecheck
	$(BIN)/tsc -p scripts/tsconfig.json

## lint: eslint across the workspace
lint:
	$(BIN)/eslint .

## boundary: prove the domain purity rule still fires
boundary:
	./scripts/boundary-check.sh

## doc-check: the documentation gate
doc-check:
	./scripts/doc-check.sh

## fixtures: regenerate the parity fixtures the server is held to
##   Part of changing a rule, not an occasional chore. See ADR-0005.
fixtures:
	node scripts/emit-fixtures.ts

## app-typecheck: tsc over the mobile app
app-typecheck:
	pnpm --filter @backhaul/mobile exec tsc --noEmit

## app-test: the mobile app's tests
app-test:
	pnpm --filter @backhaul/mobile test

## app-pods: CocoaPods, with the locale it needs
##   Without LANG, CocoaPods fails with Encoding::CompatibilityError and the
##   message does not mention the locale.
app-pods:
	cd apps/mobile/ios && LANG=en_US.UTF-8 pod install

## app-android: build and install on a booted emulator or device
##   Needs JAVA_HOME and ANDROID_HOME; see docs/TOOLCHAIN.md.
app-android:
	pnpm --filter @backhaul/mobile exec react-native run-android

## app-apk: just the debug APK
app-apk:
	cd apps/mobile/android && ./gradlew :app:assembleDebug

## app-ios: run the app on a booted simulator
app-ios:
	pnpm --filter @backhaul/mobile exec react-native run-ios

## shot: capture a screenshot — make shot N=01-trips [P=android]
shot:
	@test -n "$(N)" || (echo 'usage: make shot N="01-trips" [P=android]'; exit 1)
	@./scripts/screenshot.sh "$(N)" "$(or $(P),ios)"

## server-build: build the .NET solution
server-build:
	cd server && $(DOTNET) build

## server-test: the parity suite and the endpoint tests
server-test:
	cd server && $(DOTNET) test

## server-run: the API on an in-memory store, on :5111; Swagger at /swagger
##   The port is named here rather than left to launchSettings.json, which
##   picks 5063. `round-trip` and the mobile client's DEFAULT_BASE_URL both
##   expect 5111, so following the instruction in `round-trip` produced a
##   connection refused and no hint as to why.
server-run:
	cd server && $(DOTNET) run --project src/Backhaul.Api --urls http://127.0.0.1:5111

## server-up: the API against a real PostgreSQL, in Docker
server-up:
	cd server && docker compose up --build

## round-trip: drive the real server through the app's own client
##   Proves the two wire formats agree, which the parity fixtures cannot: they
##   hold the two domains to the same answers, not the two serialisers.
##   Expects a server on :5111 — `make server-run` in another shell.
round-trip:
	node scripts/round-trip.ts

## server-down: stop it and drop its scratch database
server-down:
	cd server && docker compose down -v

## fixtures-check: fail if the committed fixtures are stale
##   A rule changed on the TypeScript side without regenerating would otherwise
##   only surface as a C# test failure, which reads as "the server is broken"
##   rather than "you forgot a step".
fixtures-check:
	@node scripts/emit-fixtures.ts >/dev/null
	@git diff --quiet -- fixtures/parity.json || { \
		echo "fixtures/parity.json is stale — run 'make fixtures' and commit it"; \
		git --no-pager diff --stat -- fixtures/parity.json; \
		exit 1; \
	}
	@echo "parity fixtures are current"

## gates: the blocking checks alone
gates: typecheck app-typecheck lint boundary doc-check fixtures-check

## ci: everything
ci: gates test app-test server-test

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
	rm -rf packages/*/dist packages/*/.turbo .turbo
	rm -rf server/src/*/bin server/src/*/obj server/tests/*/bin server/tests/*/obj
	rm -rf apps/mobile/ios/build apps/mobile/android/build apps/mobile/android/app/build
	rm -rf apps/mobile/android/.gradle
	find . -name '*.tsbuildinfo' -not -path './node_modules/*' -delete
	@echo "cleaned — node_modules left alone; make setup-clean to drop that too"

## setup-clean: clean plus node_modules
setup-clean: clean
	find . -name node_modules -maxdepth 3 -type d -prune -exec rm -rf {} +

.PHONY: help setup test typecheck lint boundary doc-check gates ci adr journal clean setup-clean \
	fixtures fixtures-check server-build server-test server-run server-up server-down \
	app-typecheck app-test app-pods app-ios app-android app-apk shot round-trip
