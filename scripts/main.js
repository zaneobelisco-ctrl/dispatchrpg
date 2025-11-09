Hooks.once("init", () => {
  console.log("DispatchRPG | init");

  class DispatchActorSheet extends ActorSheet {
    static get defaultOptions() {
      return mergeObject(super.defaultOptions, {
        classes: ["dispatch", "sheet", "actor"],
        template: "systems/dispatchrpg/templates/actor-sheet.html",
        width: 850,
        height: 750,
        resizable: true
      });
    }

    getData() {
      const data = super.getData();
      data.data.atributos = data.data.atributos || { FOR: 0, VIG: 0, DES: 0, INT: 0, POD: 0, CAR: 0 };
      data.data.pericias = data.data.pericias || {};
      data.data.pv = data.data.pv || 0;
      data.data.pp = data.data.pp || 0;
      data.data.san = data.data.san || 0;
      return data;
    }

    activateListeners(html) {
      super.activateListeners(html);
      html.find(".roll").click(this._onRoll.bind(this));
    }

    async _onRoll(event) {
      event.preventDefault();
      const btn = event.currentTarget;
      const skill = btn.dataset.skill;
      const actor = this.actor;
      const per = Number(actor.system.pericias?.[skill]) || 0;
      const roll = await new Roll(`1d20 + ${per}`).roll({ async: true });
      roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor }), flavor: `Teste de ${skill}` });
    }
  }

  Actors.unregisterSheet("core", ActorSheet);
  Actors.registerSheet("dispatchrpg", DispatchActorSheet, { makeDefault: true });
});