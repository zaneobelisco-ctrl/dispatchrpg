import { DispatchActorSheet } from "./module/actor-sheet.js";

Hooks.once("init", function() {
  console.log("Dispatch RPG | Inicializando sistema...");

  Actors.unregisterSheet("core", ActorSheet);
  Actors.registerSheet("dispatchrpg", DispatchActorSheet, {
    makeDefault: true
  });
});
