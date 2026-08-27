# Toolchain

What has to be installed, and the things that went wrong installing it. Every
entry here cost real time; none of them is obvious from the error message it
produces.

---

## Node

**22.18 or newer.** The domain package runs its tests through Node's own type
stripping — no build step, no loader, no jest.

**Type stripping cannot erase a TypeScript parameter property.** Constructor
shorthand (`constructor(private readonly x: string)`) fails with
`ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX`, because stripping can delete a type but
not *emit* an assignment. Anything a script might import — which includes the
app's API client, via `make round-trip` — has to stay strip-compatible.

## pnpm

**Two settings moved and are silently ignored where the documentation used to
put them.** Both now live in `pnpm-workspace.yaml`:

- `nodeLinker: hoisted` — in `.npmrc` as `node-linker` it does nothing. React
  Native's Metro bundler and both native build systems walk `node_modules`
  directly rather than going through Node's resolver, and none of them copes
  with pnpm's symlinked layout.
- `allowBuilds` — replaces `onlyBuiltDependencies` in `package.json`. pnpm 11
  fails the install until every package that wants to run an install script is
  answered.

## iOS

**`export LANG=en_US.UTF-8` before CocoaPods.** Without it `pod install` fails
with `Encoding::CompatibilityError`, and the message does not mention the
locale. `make app-pods` sets it.

## Android

Nothing here ships with macOS.

```bash
brew install openjdk@17 android-commandlinetools
export JAVA_HOME="$(brew --prefix openjdk@17)/libexec/openjdk.jdk/Contents/Home"
export ANDROID_HOME="$HOME/Library/Android/sdk"
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$PATH"
```

### The platform React Native asks for does not exist

RN 0.87 generates `compileSdkVersion = 37` and `buildToolsVersion = "37.0.0"`.
Build-tools 37 is published; **the platform `android-37` is not**. `sdkmanager`
answers `Failed to find package 'platforms;android-37'` and Gradle answers
`Failed to find target with hash string 'android-37'` — which reads like a
broken SDK install rather than a platform that has not shipped.

`apps/mobile/android/build.gradle` pins 36, with the reason next to it. A
sibling project lost an afternoon to the same message inside a Docker build.

### The generated Gradle paths assume no workspace

`settings.gradle` is generated with `../node_modules/@react-native/gradle-plugin`.
pnpm hoists to the repository root, so it is **three** directories up. The
generated path fails with `Included build ... does not exist`.

`app/build.gradle` needs the same correction for `reactNativeDir`, `codegenDir`
and `cliFile`.

A lookup that walks up looking for `node_modules` seems obviously better and
does not work: Gradle requires `plugins {}` to be the first statement after
`pluginManagement {}`, so the search has to live inside that block, and from
there `includeBuild` fails to register the composite — leaving *"No included
builds contain this plugin"*, which points at the plugin rather than the path.
Literal paths, checked by the build failing loudly, are the better trade.

### `avdmanager` resolves its SDK from its own directory

Its launcher computes `APP_HOME` with `pwd -P`, which follows a symlink. A
symlink from `$ANDROID_HOME/cmdline-tools/latest` to the Homebrew copy
therefore resolves *back* to Homebrew, and `avdmanager` looks for an SDK there:

```
Error: Package path is not valid. Valid system image paths are:
null
```

`ANDROID_HOME` and `ANDROID_SDK_ROOT` make no difference. **Copy** the tools
into the SDK rather than linking them.

### The emulator wants 12 GB before it will start

```
FATAL | Not enough space to create userdata partition.
        Available: 8415.69 MB, need 12288.00 MB.
```

The SDK itself is 8.4 GB. Set `disk.dataPartition.size=4096M` in
`~/.android/avd/<name>.avd/config.ini`; 4 GB boots and holds a debug APK.

## .NET

**Installed per-user at `~/.dotnet`**, not on a default PATH. The Makefile's
`DOTNET` variable points at it and is overridable for CI.

**Every package resolves to the .NET 10 line by default** and fails against
`net9.0`. `server/Directory.Packages.props` pins centrally, so there is one
place to move rather than five csproj files that can disagree.

**`dotnet ef migrations add` writes source, not a build.** Running
`bin/Debug/…dll` afterwards runs the old assembly, and the new table simply is
not there: `relation "AccessTokens" does not exist`, which reads like a broken
migration rather than a build you did not do. It happened twice.
