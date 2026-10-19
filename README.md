# BlockVerse 🎮

Roblox style multiplayer blocky game platform — Hub + mini-games.

## என்ன இருக்கு
- **Hub world** — எல்லா players-உம் ஒண்ணா சேர்ந்து நடக்கலாம், chat பண்ணலாம்
- **🏃 Obby** — 26 platforms parkour, moving platforms, சுத்துற red kill bars, lava, checkpoints. Finish பண்ணா **+50 coins**
- **🏷️ Tag** — ஒருத்தர் "IT" (சிவப்பு கிரீடம்). தொட்டா அவங்க IT ஆவாங்க. 90 sec முடியும்போது IT இல்லாதவங்களுக்கு **+20 coins**
- Custom name + color avatar, name tag, walk animation
- Phone-க்கு joystick + JUMP button; PC-க்கு WASD + Space, mouse drag = camera
- Server-side validation (name sanitize, tag check, checkpoint order)

## v1.1 புதுசு
- 🥊 **Fight Arena** — punch (F / 🥊 button), HP bar, knockback, KO = +15 coins
- 🔊 **Live Voice chat** — Voice button தொட்டா அதே game-ல இருக்கிறவங்க கூட mic-ல நேரடியா பேசலாம் (WebRTC)
- 💾 **Save points** — Obby-ல ஒவ்வொரு 4 platform-க்கும் save point; விழுந்தா / app close பண்ணாலும் கடைசி save-ல இருந்து
- ✨ Graphics: sky gradient, மேகங்கள், stud texture blocks, soft shadows, particles

## Run பண்ண (PC-ல)
```bash
npm install
npm start
```
Browser-ல `http://localhost:3000` திறங்க. அதே WiFi-ல phone-ல `http://<laptop-IP>:3000` திறந்தா friends கூட விளையாடலாம்.

## Online-ல போட (free)
1. இந்த folder-ஐ GitHub repo-வா push பண்ணுங்க
2. **Render.com** → New → Web Service → repo select → Build: `npm install`, Start: `npm start`
3. கிடைக்கிற link-ஐ யாருக்கு வேணும்னாலும் share பண்ணலாம்

## புது mini-game சேர்க்க
1. `server.js` → `ROOMS` array-ல பெயர் சேருங்க
2. `public/game.js` → `buildXxx()` function எழுதி `enterRoom` map-ல சேருங்க
3. `buildHub()`-ல அதுக்கு ஒரு portal: `block(x,2,z,4,4,0.5,'#color',{opacity:.6,solid:false,portal:'xxx'})`

## Files
| File | வேலை |
|---|---|
| `server.js` | Express + Socket.io — rooms, positions, tag/obby logic, coins |
| `public/index.html` | UI: start screen, HUD, chat, joystick |
| `public/game.js` | Three.js 3D world, avatars, physics, controls, networking |

## அடுத்த steps (Google Play-க்கு)
- Coins save பண்ண database (Firebase/MongoDB) + login
- Avatar shop (coins வச்சு hats/colors வாங்க)
- Players தானே map build பண்ற "Studio" mode
- Capacitor வச்சு Android APK ஆக்கி Play Store-ல போடலாம்
