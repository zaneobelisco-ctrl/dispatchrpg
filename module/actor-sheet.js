// module/actor-sheet.js - Dispatch RPG: actor sheet logic (robust actor lookup + rolls)
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

    // Perícias padrão
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

    const root = this.element;

    // Upload photo
    root.on("click", ".btn-upload-photo", (ev) => this._onUploadPhoto(ev));

    // Rolls (delegated)
    root.on("click", ".roll", (ev) => this._onRollPericia(ev));
    root.on("click", ".roll-iniciativa", (ev) => this._onRollIniciativa(ev));
    root.on("click", ".roll-taxa", (ev) => this._onRollTaxaCura(ev));

    // Double click to increment/decrement pericia
    root.on("dblclick", ".skill-input", async (ev) => {
      const input = ev.currentTarget;
      const name = input.name;
      const match = name.match(/^data\.pericias\.(.*)$/);
      if (!match) return;
      const skillName = match[1];
      const current = Number($(input).val()) || 0;
      const delta = ev.shiftKey ? -1 : 1;
      const newVal = Math.max(0, current + delta);

      const newPericias = duplicate(this.actor?.system?.pericias || this.actor?.data?.data?.pericias || this.actor?.data?.pericias || {});
      newPericias[skillName] = newVal;
      // Use nested update to avoid clobbering other data
      await this.actor.update({ "data": { "pericias": newPericias } });
      $(input).val(newVal);
      ui.notifications.info(`${skillName}: ${newVal}`);
    });

    // Save on blur to persist quick edits
    root.on("blur", "input, textarea", (ev) => {
      const form = this.element.find("form");
      if (form.length) form.submit();
    });
  }

  // helper: robust actor lookup and return actor object
  _getActorFromContext() {
    // Prefer this.actor if available
    if (this.actor) return this.actor;

    // Try to get actor id from sheet DOM element
    try {
      const el = this.element?.closest?.call ? this.element.closest(".app") : this.element.closest(".app");
      const actorId = el?.dataset?.actorId || this.element?.attr?.call ? this.element.attr("data-actor-id") : this.element.attr("data-actor-id");
      if (actorId) {
        const actor = game.actors.get(actorId) || canvas.tokens?.get(actorId)?.actor;
        if (actor) return actor;
      }
    } catch (err) {
      // ignore
    }

    // Fallback: try to find a rendered sheet actor
    const found = game.actors?.contents?.find?.(a => a.sheet && a.sheet._state && a.sheet._state.rendered);
    if (found) return found;
    return null;
  }

  // Get actor data object in a way compatible with different Foundry versions
  _getActorData(actor) {
    if (!actor) return null;
    return actor.system || actor.data?.data || actor.data || null;
  }

  _onUploadPhoto(event) {
    event.preventDefault();
    const fp = new FilePicker({
      type: "image",
      callback: (path) => {
        const actor = this._getActorFromContext();
        if (!actor) return ui.notifications.warn("Salve a ficha primeiro para definir a foto.");
        actor.update({ img: path });
      }
    });
    fp.render(true);
  }

  // Perícia roll with robust actor lookup
  async _onRollPericia(event) {
    event.preventDefault();
    const button = event.currentTarget;
    const skill = button.dataset.skill;
    if (!skill) return ui.notifications.warn("Perícia não definida no botão.");

    const actor = this._getActorFromContext();
    if (!actor) {
      return ui.notifications.warn("Não foi possível identificar o personagem. Salve a ficha e tente novamente.");
    }

    const actorData = this._getActorData(actor);
    if (!actorData) return ui.notifications.error("Dados do personagem não encontrados.");

    // Map perícia -> atributo
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

    const periciaVal = Number(actorData.pericias?.[skill]) || 0;
    const attrKey = map[skill] || "FOR";
    const attrVal = Number(actorData.atributos?.[attrKey]) || 0;

    const formula = `1d20 + ${attrVal} + ${periciaVal}`;
    try {
      const roll = await new Roll(formula).roll({ async: true });
      const flavor = `${actor.name} — ${skill} (1d20 + ${attrVal} + ${periciaVal})`;
      roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor }), flavor });
    } catch (err) {
      console.error("Erro na rolagem:", err);
      ui.notifications.error("Erro ao executar a rolagem.");
    }
  }

  async _onRollIniciativa(event) {
    event.preventDefault();
    const actor = this._getActorFromContext();
    if (!actor) return ui.notifications.warn("Salve a ficha antes de rolar iniciativa.");
    const actorData = this._getActorData(actor);
    const des = Number(actorData.atributos?.DES) || 0;
    const formula = `1d20 + ${des}`;
    try {
      const roll = await new Roll(formula).roll({ async: true });
      roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor }), flavor: `${actor.name} — Iniciativa` });
    } catch (err) {
      console.error(err);
      ui.notifications.error("Erro ao rolar iniciativa.");
    }
  }

  async _onRollTaxaCura(event) {
    event.preventDefault();
    const actor = this._getActorFromContext();
    if (!actor) return ui.notifications.warn("Salve a ficha antes de rolar a taxa de cura.");
    const actorData = this._getActorData(actor);
    const vig = Number(actorData.atributos?.VIG) || 0;
    const formula = `1d6 + ${vig}`;
    try {
      const roll = await new Roll(formula).roll({ async: true });
      roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor }), flavor: `${actor.name} — Taxa de Cura (1d6 + VIG)` });
    } catch (err) {
      console.error(err);
      ui.notifications.error("Erro ao rolar taxa de cura.");
    }
  }
}
