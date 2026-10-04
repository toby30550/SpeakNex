# SpeakNex

**Logiciel de communication vocale client/serveur**

SpeakNex est un logiciel de communication vocale en temps réel, inspiré dans son principe par TeamSpeak 3. Il permet de créer des serveurs vocaux avec canaux, utilisateurs, permissions et chat texte.

![SpeakNex](logo.png)

## Composants

| Composant | Description |
|-----------|-------------|
| **SN1** | SpeakNex Client 1 - Application desktop pour Windows |
| **SN1-Server** | Serveur SpeakNex - Disponible pour Windows et Linux |

## Fonctionnalités

### Client (SN1)
- Connexion à un serveur par adresse IP/nom de domaine et port
- Arborescence des serveurs, canaux et utilisateurs
- Communication vocale en temps réel
- Chat texte (canal, serveur, message privé)
- Gestion du microphone (activer/désactiver, volume, PTT)
- Gestion des haut-parleurs (volume)
- Clés de privilèges pour les permissions
- Paramètres complets (audio, interface, connexion, notifications)
- Interface sombre inspirée de TeamSpeak 3

### Serveur (SN1-Server)
- Gestion des connexions clientes
- Gestion des canaux (création, suppression, renommage)
- Gestion des utilisateurs et permissions
- Système de groupes (Guest, Default, Moderator, Admin)
- Système de clés de privilèges
- Relay audio en temps réel
- Chat texte
- Configuration persistante
- Support Windows et Linux
- Port configurable (défaut: 30000)

## Installation

### Client Windows

Télécharger `SN1-Setup.exe` depuis les [Releases](https://github.com/toby30550/SpeakNex/releases) et lancer l'installateur.

### Serveur Windows

Télécharger `SN1-Server-Setup.exe` et suivre l'assistant d'installation.

### Serveur Linux

Télécharger `SN1-Server.tar.gz`, extraire et lancer `sudo ./install.sh`.

## Utilisation Rapide

### Démarrer un serveur

```bash
# Windows
SN1-Server.bat

# Linux
./start-server.sh

# Options
node server.js --port 30000 --name "Mon Serveur"
```

### Se connecter au serveur

1. Lancer SN1
2. Cliquer sur "Se connecter" ou `Ctrl+O`
3. Entrer le pseudo et l'adresse du serveur (ex: `127.0.0.1:30000`)
4. Cliquer sur "Se connecter"

## Développement

### Prérequis

- Node.js 18 ou plus récent
- npm

### Installation

```bash
git clone https://github.com/toby30550/SpeakNex.git
cd SpeakNex
npm install
```

### Lancer en mode développement

```bash
# Serveur
npm run server

# Client
npm run client
```

### Build

```bash
# Client Windows
npm run build:client:setup

# Serveur Windows
npm run build:server:win

# Serveur Linux
npm run build:server:linux

# Tout
npm run build:all
```

### Release

```bash
# Build + vérification
npm run release

# Build + publication GitHub
npm run release -- --release

# Dry run (sans publication)
npm run release -- --release --dry-run
```

## Architecture

### Protocole Réseau

- **Connexion**: WebSocket sur port 30000 (configurable)
- **Messages contrôle**: JSON
- **Audio**: Données binaires PCM 16kHz mono

### Messages WebSocket

| Type | Direction | Description |
|------|-----------|-------------|
| `connect` | Client → Serveur | Connexion avec pseudo et mot de passe |
| `server_info` | Serveur → Client | Informations du serveur |
| `channel_list` | Serveur → Client | Liste des canaux |
| `join_channel` | Client → Serveur | Rejoindre un canal |
| `chat_message` | Bidirectionnel | Message de chat |
| `privilege_key` | Client → Serveur | Utiliser une clé de privilèges |
| `audio` | Client → Serveur → Client | Données audio binaires |

### Système Audio

- Capture: Microphone via Web Audio API
- Format: PCM 16kHz mono, 16-bit
- Transmission: Relay serveur via WebSocket
- Lecture: AudioWorklet / ScriptProcessorNode

### Permissions

| Groupe | Parler | Écrire | Rejoindre | Expulser | Bannir | Gérer canaux |
|--------|--------|--------|-----------|----------|--------|-------------|
| Guest | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ |
| Default | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Moderator | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| Admin | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

## Structure du Projet

```
SpeakNex/
├── client/                    # Application cliente Electron
│   ├── main.js               # Processus principal Electron
│   ├── preload.js            # Script preload (IPC)
│   ├── index.html            # Interface principale
│   ├── connect.html          # Dialog de connexion
│   ├── settings.html         # Dialog des paramètres
│   ├── privilege-key.html    # Dialog clé de privilèges
│   ├── renderer.js           # Logique client principale
│   ├── connect-renderer.js   # Logique dialog connexion
│   ├── settings-renderer.js  # Logique dialog paramètres
│   ├── privilege-key-renderer.js
│   ├── package.json
│   ├── electron-builder.yml  # Configuration build
│   └── installer.nsh         # Script NSIS
├── server/                    # Serveur SpeakNex
│   ├── server.js             # Serveur principal
│   └── package.json
├── scripts/                   # Scripts de build/release
│   ├── build-server-win.js
│   ├── build-server-linux.js
│   └── release.js
├── dist/                      # Sortie des builds
├── logo.png                   # Logo officiel
├── VERSION                    # Numéro de version
├── package.json
├── README.md
└── LICENSE
```

## Compatibilité

| Plateforme | Client | Serveur |
|------------|--------|---------|
| Windows 7+ | ✅ | ✅ |
| Windows 10 | ✅ | ✅ |
| Windows 11 | ✅ | ✅ |
| Linux      | ❌ | ✅ |
| macOS      | ❌ | ✅ |

## Version

Version actuelle: **26.0**

## Licence

MIT - Voir [LICENSE](LICENSE)

## Contact

GitHub: https://github.com/toby30550/SpeakNex
