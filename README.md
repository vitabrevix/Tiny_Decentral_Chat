# P2P Chat

Gun.js and Yjs are the only two 100% web options for decentralized chatting that I have found, unfortunately it seems that all public y-webrtc signaling servers and known-live gun community relays are currently down.

This makes online communicationg through those two options virtually impossible considering their over-reliance on public and free services for hosting, unless the user self hosts.

## Local chatting (Offline)

Simply open the page for this repo, you'll be able to chat in your own machine as much as you please, rooms, usernames, everything works.

```bash
# Running client only
npm run dev
```

## Online chatting

For online communications the folder /server contains the basics on how to run a server for eacah service.

```bash
# Running both servers
npm run dev:full
```
```bash
# Running Gun servers
npm run dev:gun
```
```bash
# Running Yjs servers
npm run dev:yjs
```

```bash
# Windows Server Version
npm run dev:full:win
npm run dev:gun:win
npm run dev:yjs:win
```