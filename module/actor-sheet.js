// module/actor-sheet.js - Dispatch RPG: actor sheet logic (perícias + rolls + quick increment)
export class DispatchActorSheet extends ActorSheet {
  static get defaultOptions() {
    return mergeObject(super.defaultOptions, {
      classes: ["dispatch", "sheet", "actor"],
      template: "systems/dispatchrpg/templates/actor-sheet.html",
      width: 860,
      height: 740,
      resizable: true
    });
  }

  getData() {
    const data = super.getData();
    // Garantir atributos com padrão 0
    data.data.atributos = data.data.atributos || { FOR: 0, VIG: 0, DES: 0, INT: 0, POD: 0, CAR: 0 };

    // Lista padrão de perícias (com Primeiros Socorros incluída)
    const defaultPericias = {
      "Atletismo": 0,
      "Condução": 0,
      "Desarmado": 0,
      "Dissimulação": 0,
      "Evasão": 0,
      "Vontade": 0,
      "Furtividade": 0,
      "Influência": 0,
      "Intuição": 0,
      "Língua Nativa": 0,
      "Malandragem": 0,
      "Musculatura": 0,
      "Ocultação": 0,
      "Pesquisa": 0,
      "Percepção": 0,
      "Primeiros Socorros": 0
    };

    // Merge: se não existe data.pericias, usa o default; se existe, garante que todas as default existam
    data.data.pericias = data.data.pericias || {};
    for (let k of Object.keys(defaultPericias)) {
      if (data.data.pericias[k] === undefined) data.data.pericias[k] = defaultPericias[k];
    }

    // Garantir status padrão
    data.data.pv = data.data.pv ?? 0;
    data.data.pp = data.data.pp ?? 0;
    data.data.san = data.data.san ?? 0;

    return data;
  }

  activateListeners(html) {
    super.activateListeners(html);

    // Rolar perícia (botão 🎲)
    html.find(".roll").click(this._onRollPericia.bind(this));

    // Duplo clique em input de perícia para incrementar; Shift + duplo clique para decrementar
    html.find(".skill-input").on("dblclick", async (ev) => {
      const input = ev.currentTarget;
      const name = input.name; // "data.pericias.<Nome>"
      const match = name.match(/^data\.pericias\.(.*)$/);
      if (!match) return;
      const skillName = match[1];
      const current = Number($(input).val()) || 0;
      const delta = ev.shiftKey ? -1 : 1;
      const newVal = Math.max(0, current + delta);

      const newPericias = duplicate(this.actor.system?.pericias || this.actor.data.data.pericias || {});
      newPericias[skillName] = newVal;
      await this.actor.update({ "data": { "pericias": newPericias } });
      $(input).val(newVal);
      ui.notifications.info(`${skillName}: ${newVal}`);
    });
  }

  // Handler de rolagem: 1d20 + atributo + perícia
  async _onRollPericia(event) {
    event.preventDefault();
    const button = event.currentTarget;
    const skill = button.dataset.skill;
    if (!skill) return ui.notifications.warn("Perícia não definida no botão.");

    // Mapear perícia -> atributo base
    const map = {
      "Atletismo": "FOR",
      "Condução": "DES",
      "Desarmado": "FOR",
      "Dissimulação": "CAR",
      "Evasão": "DES",
      "Vontade": "POD",
      "Furtividade": "DES",
      "Influência": "CAR",
      "Intuição": "INT",
      "Língua Nativa": "INT",
      "Malandragem": "POD",
      "Musculatura": "FOR",
      "Ocultação": "INT",
      "Pesquisa": "INT",
      "Percepção": "INT",
      "Primeiros Socorros": "INT"
    };

    const actorData = this.actor.data.data;
    const periciaVal = Number(actorData.pericias?.[skill]) || 0;
    const attrKey = map[skill] || "FOR";
    const attrVal = Number(actorData.atributos?.[attrKey]) || 0;

    const formula = `1d20 + ${attrVal} + ${periciaVal}`;
    const roll = await new Roll(formula).roll({ async: true });
    const flavor = `${this.actor.name} — ${skill} (1d20 + ${attrVal} + ${periciaVal})`;
    roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor: this.actor }), flavor });
  }
}
