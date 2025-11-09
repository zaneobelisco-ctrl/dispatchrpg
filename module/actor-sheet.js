// module/actor-sheet.js - Dispatch RPG: actor sheet logic (fix: robust event delegation + rolls)
export class DispatchActorSheet extends ActorSheet {
  static get defaultOptions() {
    return mergeObject(super.defaultOptions, {
      classes: ["dispatch", "sheet", "actor"],
      template: "systems/dispatchrpg/templates/actor-sheet.html",
      width: 920,
      height: 760,
      resizable: true
    });
  }

  getData() {
    const data = super.getData();
    // Atributos padrão
    data.data.atributos = data.data.atributos || { FOR: 0, VIG: 0, DES: 0, INT: 0, POD: 0, CAR: 0 };

    // Perícias padrão (inclui Primeiros Socorros)
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

    data.data.pericias = data.data.pericias || {};
    for (let k of Object.keys(defaultPericias)) {
      if (data.data.pericias[k] === undefined) data.data.pericias[k] = defaultPericias[k];
    }

    data.data.pv = data.data.pv ?? 0;
    data.data.pp = data.data.pp ?? 0;
    data.data.san = data.data.san ?? 0;

    // helpers for template
    data._attrKeys = Object.keys(data.data.atributos);
    data._periciasKeys = Object.keys(data.data.pericias);

    return data;
  }

  activateListeners(html) {
    super.activateListeners(html);

    // Delegated listeners bound to this.element (robusto contra re-renders)
    const root = this.element;

    // Upload photo
    root.on("click", ".btn-upload-photo", (ev) => this._onUploadPhoto(ev));

    // Rolls (perícias)
    root.on("click", ".roll", (ev) => this._onRollPericia(ev));

    // Rolls Iniciativa / Taxa de Cura
    root.on("click", ".roll-iniciativa", (ev) => this._onRollIniciativa(ev));
    root.on("click", ".roll-taxa", (ev) => this._onRollTaxaCura(ev));

    // Increment/Decrement: double click on inputs
    root.on("dblclick", ".skill-input", async (ev) => {
      const input = ev.currentTarget;
      const name = input.name;
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

    // Ensure text inputs save on blur (foundry's form submit handles main save, but this helps instant save)
    root.on("blur", "input, textarea", async (ev) => {
      // trigger default form submit to save actor
      const form = this.element.find("form");
      if (form.length) {
        // Use the ActorSheet's _onSubmit to save (calls this._onSubmit maybe private),
        // Fallback: call form.submit()
        form.submit();
      }
    });
  }

  // FilePicker for portrait
  _onUploadPhoto(event) {
    event.preventDefault();
    const fp = new FilePicker({
      type: "image",
      callback: (path) => {
        this.actor.update({ img: path });
      }
    });
    fp.render(true);
  }

  // Perícia roll: 1d20 + atributo + pericia
  async _onRollPericia(event) {
    event.preventDefault();
    const button = event.currentTarget;
    const skill = button.dataset.skill;
    if (!skill) return ui.notifications.warn("Perícia não definida.");

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
    try {
      const roll = await new Roll(formula).roll({ async: true });
      const flavor = `${this.actor.name} — ${skill} (1d20 + ${attrVal} + ${periciaVal})`;
      roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor: this.actor }), flavor });
    } catch (err) {
      console.error("Roll error:", err);
      ui.notifications.error("Erro ao rolar a perícia.");
    }
  }

  // Iniciativa roll: 1d20 + DES
  async _onRollIniciativa(event) {
    event.preventDefault();
    const actorData = this.actor.data.data;
    const des = Number(actorData.atributos?.DES) || 0;
    const formula = `1d20 + ${des}`;
    try {
      const roll = await new Roll(formula).roll({ async: true });
      roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor: this.actor }), flavor: `${this.actor.name} — Iniciativa` });
    } catch (err) {
      console.error(err);
      ui.notifications.error("Erro ao rolar iniciativa.");
    }
  }

  // Taxa de cura: 1d6 + VIG
  async _onRollTaxaCura(event) {
    event.preventDefault();
    const actorData = this.actor.data.data;
    const vig = Number(actorData.atributos?.VIG) || 0;
    const formula = `1d6 + ${vig}`;
    try {
      const roll = await new Roll(formula).roll({ async: true });
      roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor: this.actor }), flavor: `${this.actor.name} — Taxa de Cura (1d6 + VIG)` });
    } catch (err) {
      console.error(err);
      ui.notifications.error("Erro ao rolar taxa de cura.");
    }
  }
}
