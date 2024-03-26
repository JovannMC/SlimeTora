# SlimeTora (GX6 fork)
## **This fork includes basic support for the GX6 dongle. This is NOT production ready at all and you W I L L experience bugs.**

A program that connects the HaritoraX Wireless trackers to the [SlimeVR server](https://docs.slimevr.dev/server/index.html), supporting Bluetooth and the GX6 communication dongle*

\* **if you haven't noticed already, read the huge notices**

## A rewrite of SlimeTora is in the works which will improve stability and performance *massively*.

# Known issues with fork
- **Literally everything, this is NOT production ready.**
  - When you actually connect the trackers, the program should work flawlessly
- Connecting is very finicky, trackers connect on SlimeTora but not show in SlimeVR
  - Usually fixed by restarting the trackers or reconnecting the GX6 dongle
- Higher CPU usage
  - Temporarily mediated with this fork by removing the tracker visualization code, will be fixed in rewrite and given option to toggle it
- UI incomplete
  - Yeah, very quick implementation of the stuff which you can tell. Rewrite will improve everything lol.
- Tapping on trackers aren't detected (for gesture resets) in SlimeVR
- Battery level is inaccurate
- Using "Disconnect all devices" and reconnecting causes data to not be submitted correctly

# How to use
- Install the [SlimeVR server](https://docs.slimevr.dev/server/index.html)
- Download the latest [SlimeTora](https://github.com/OCSYT/SlimeTora/releases/latest) release
- Extract the zip file and run `SlimeTora.exe`
- Turn on your trackers and press `Connect to trackers`
- Assign your trackers in SlimeVR and enjoy! :)

Make sure you connect all trackers before assigning the roles in SlimeVR, and go through the usual calibration steps in the SlimeVR software after.

# Development
- Clone the project - `git clone https://github.com/OCSYT/SlimeTora.git`
- Install the dependencies - `npm i`
- Start the dev environment - `npm start`
