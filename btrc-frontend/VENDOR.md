# `src/vendor/` — Why It Exists

## The Problem

When the Docker stack is started for the first time, the `frontend` service runs
`yarn install` inside the container and writes all packages to `/app/node_modules`,
which is backed by an **anonymous Docker volume**.

Because the host directory `btrc-frontend/node_modules/` was initially created by
Docker (running as root), it ends up **root-owned on the host filesystem**:

```
drwxr-xr-x 2 root root  btrc-frontend/node_modules/
drwxr-xr-x 3 root root  btrc-frontend/public/
```

This means running `yarn add <package>` locally (outside Docker) fails with:

```
error EACCES: permission denied, mkdir '.../node_modules/...'
```

The same issue affects `btrc-frontend/public/` — creating subdirectories like
`public/tiles/` also fails.

## The Workaround for `protomaps-leaflet`

`protomaps-leaflet` is needed to render offline vector PMTiles in Leaflet.
Since `yarn add` could not write to the local `node_modules/`, the package was
installed to `/tmp` and its compiled ESM build copied here:

```
btrc-frontend/src/vendor/protomaps-leaflet/   ← gitignored
```

`vite.config.js` resolves the import via an alias:

```js
resolve: {
  alias: {
    'protomaps-leaflet': resolve(__dirname, 'src/vendor/protomaps-leaflet/dist/esm/index.js'),
  },
},
```

`protomaps-leaflet` is also declared in `package.json` (`^5.1.0`) so a clean
Docker image build (`docker compose up --build frontend`) installs it to the
container's `node_modules` via the normal `yarn install` path, and the alias
in `vite.config.js` will still resolve correctly (Vite alias takes priority
over `node_modules` when the alias path exists, otherwise falls back to
`node_modules` automatically).

## Permanent Fix (optional)

Fix the ownership of the Docker-created directories once:

```bash
sudo chown -R $USER:$USER btrc-frontend/node_modules btrc-frontend/public
```

Then run a normal install:

```bash
cd btrc-frontend && yarn install
```

After that, `src/vendor/` can be deleted and the alias in `vite.config.js` can
be removed — Vite will resolve `protomaps-leaflet` from `node_modules` directly.

## What Is Gitignored

```
btrc-frontend/src/vendor/          # vendor package files (regenerable)
btrc-frontend/public/tiles/        # large binary tile files
tiles/*.pmtiles                    # 493 MB Bangladesh tile extract
tiles/*.mbtiles
```

All of these are **reproducible**:

| File | How to regenerate |
|---|---|
| `src/vendor/protomaps-leaflet/` | `cd /tmp && yarn add protomaps-leaflet && cp -r /tmp/node_modules/protomaps-leaflet btrc-frontend/src/vendor/` |
| `tiles/bangladesh.pmtiles` | `bash scripts/download-tiles.sh` |
