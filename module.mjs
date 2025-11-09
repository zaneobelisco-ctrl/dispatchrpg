import { DispatchActorSheet } from "./module/actor-sheet.js";

Hooks.once("init", function() {
  console.log("Dispatch RPG | Inicializando sistema...");
  Actors.unregisterSheet("core", ActorSheet);
  // registra a ficha PARA o tipo "character"
  Actors.registerSheet("dispatchrpg", DispatchActorSheet, {
    makeDefault: true,
    types: ["character"]
  });
});
