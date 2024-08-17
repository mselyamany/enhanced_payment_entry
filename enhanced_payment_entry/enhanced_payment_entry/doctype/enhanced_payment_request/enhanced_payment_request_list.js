frappe.listview_settings['Enhanced Payment Request'] = {
	add_fields: ["amount", "paid_amount", "status", "paid_percent"],
	get_indicator: function (doc) {
		if (doc.status === "Paid") {
			return [__("Paid"), "green", "status,=,Paid"];
		} else if (doc.status === "Pending") {
			return [__("Pending"), "red", "status,=,Pending"];
		} else if (doc.paid_percent < 100){
			console.log(doc.paid_percent);
			return [__("Parially Paid"), "orange", "paid_percent,<,100|status,!=,Paid"];
		}
	},
	onload: function(listview) {
		
	}
};
