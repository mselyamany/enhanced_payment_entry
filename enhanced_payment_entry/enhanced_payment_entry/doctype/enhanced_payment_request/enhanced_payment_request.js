// Copyright (c) 2022, Infinity Systems and contributors
// For license information, please see license.txt
frappe.provide("erpnext.accounts.dimensions");

frappe.ui.form.on('Enhanced Payment Request', {
	refresh: function(frm) {
		if (!frm.doc.user && !frm.doc.docstatus == 1){
			frm.set_value('user', frappe.session.user);
		}

		if(frm.doc.docstatus == 1){
			disable_link_add_button_status('Enhanced Payment Entry', "btn btn-new btn-secondary btn-xs icon-btn", true);
		}
		
		//frm.set_value('cost_center', frappe.get_cached_value('Company', frm.doc.company, "cost_center"))
		if(frm.doc.docstatus==1 && frm.doc.amount > frm.doc.paid_amount) {		
			frm.add_custom_button(__('Make EPE'), function() {

				return frappe.call({
					method:
					"enhanced_payment_entry.enhanced_payment_entry.doctype.enhanced_payment_request.enhanced_payment_request.make_epe",
					args: {
						dn: frm.doc.name,
					},
					callback: function (r) {
						var doc = frappe.model.sync(r.message);
						frappe.set_route("Form", 'Enhanced Payment Entry', doc[0].name);
					},
				});					
			})
		}	
	},
	
	company: function(frm) {
		erpnext.accounts.dimensions.update_dimension(frm, frm.doctype);
	},
	before_save: function(frm){

	},

	mode_of_payment: function(frm){
		if (frm.doc.mode_of_payment){
			frappe.call({
				method: "erpnext.accounts.doctype.sales_invoice.sales_invoice.get_bank_cash_account",
				args: {
					"mode_of_payment": frm.doc.mode_of_payment,
					"company": frm.doc.company
				},
				callback: function(r, rt) {
					if(r.message) {
						frm.set_value('account',r.message.account)
					}
				}
			});
		}
		
	},

	account: function(frm){
		frappe.call({
			method: "erpnext.accounts.utils.get_balance_on",
			args: {
				company: frm.doc.company,
				date: frm.doc.posting_date,
				account: frm.doc.account
			},
			callback: function(r) {
				if(r) {
					frm.set_value('account_balance', r.message);
				}
			}
		})
	},
	account_currency: function(frm){
		var company_currency = frm.doc.company? frappe.get_doc(":Company", frm.doc.company).default_currency: "";
		
		
		frm.toggle_display(["rate", "base_amount"], (frm.doc.account_currency != company_currency));
		//frm.toggle_display("base_amount", (frm.doc.account_currency != company_currency));
		
		frm.set_currency_labels(["amount"], frm.doc.account_currency);
		frm.set_currency_labels(["paid_amount"], frm.doc.account_currency);
		frm.set_currency_labels(["base_amount"], company_currency);
		frm.set_currency_labels(["account_balance"], frm.doc.account_currency);
		
		
		frm.refresh_field('account_balance')

		if (frm.doc.account_currency != company_currency){
			frappe.call({
				method: "erpnext.setup.utils.get_exchange_rate",
				args: {
					from_currency: frm.doc.account_currency,
					to_currency: company_currency,
					transaction_date: frm.doc.posting_date
				},
				callback: function(r) {
					if(r) {
						frm.set_value('rate', r.message);	
					}
				}
			})
		}
	},

	cost_center: function(frm) {
		//propagate_cost_center(frm);
	},

	amount: function(frm){
		calculate_base_amount(frm);
		//recalculate_all(frm);
	},
	rate: function(frm){
		calculate_base_amount(frm);
		//recalculate_all(frm);
	},
	validate: function(frm){
		
	},

	before_submit: function(frm){
		
	}
});



function calculate_base_amount(frm){
	if (frm.doc.amount && frm.doc.rate){
		frm.set_value('base_amount', flt(frm.doc.amount) * flt(frm.doc.rate))
	}
}

function disable_link_add_button_status(dt, cn, status){
    var linksel = document.querySelector("[data-doctype='" + dt + "']");
    var addbutton = linksel.getElementsByClassName(cn)[0]
    addbutton.disabled = status;
}
